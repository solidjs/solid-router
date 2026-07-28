// The router's server-side integration with the server function runtime
// (@solidjs/web/server-functions). Server-only entry (`@solidjs/router/server`):
// it reaches for node async context via @solidjs/web/storage — keep it out of
// client bundles.
//
// One policy lives here — the vocabulary (query keys, route trees, preloads)
// is the router's:
//
// - single-flight mutations: `createFlightDataCollector` produces the
//   `collectFlightData` hook the app hands to
//   `configureServerFunctionsServer` (or the handler options). After a
//   mutation it produces the route data the mutation invalidated for the
//   page the client is on (or is being redirected to), which the handler
//   folds into the response — mutation and fresh data in one round trip.
//
// The no-JS form convention used to live here too; the runtime now owns it
// outright — it applies to browser form posts by default (redirect back with
// the outcome in a one-shot flash cookie), and `createNoJSHandler` is
// configured through @solidjs/web/server-functions/server. The router keeps
// only its read side: SSR initialization seeds the decoded cookie into
// submission state (routing.ts).
import { provideRequestEvent } from "@solidjs/web/storage";
import { REVALIDATE_HEADER } from "@solidjs/web";
import type { JSX, RequestEvent } from "@solidjs/web";
import { foldSetCookies } from "@solidjs/web/server-functions/server";
import type {
  CollectFlightDataHook,
  ServerFunctionOutcome
} from "@solidjs/web/server-functions/server";
import {
  createBranches,
  getRouteMatches,
  mergeParams,
  peekLazySubtrees,
  resolveLazySubtree
} from "./routing.js";
import { extractSearchParams } from "./utils.js";
import type { Branch, RouteDefinition, RoutePreloadFunc } from "./types.js";

export type { CollectFlightDataHook, ServerFunctionOutcome };

export interface FlightDataCollectorOptions {
  /**
   * The app's route tree — the same config objects the `createRouter`
   * factory receives, an array of them, or a thunk producing either (for
   * lazily/per-request built trees). Flight data is produced by the pure
   * preload runner: the target URL is matched against the tree and the
   * matched routes' `preload` functions run in data-only mode.
   */
  routes:
    | RouteDefinition
    | readonly RouteDefinition[]
    | (() => RouteDefinition | readonly RouteDefinition[]);
  /**
   * The root layout's preload — the same function the app passes to the
   * `createRouter` factory's `preload` option. Runs before the matched
   * routes' preloads with the semantics the root gets during a real server
   * render: the merged params of every match and `intent: "initial"`.
   */
  rootPreload?: RoutePreloadFunc;
  /** The app's base path, for resolving redirect `Location`s and matching. */
  base?: string;
}

/** A `createRouter` instance carries everything the collector needs. */
interface RouterInstanceLike {
  (props: any): JSX.Element;
  readonly routes: readonly RouteDefinition[];
  readonly config: { base?: string; preload?: RoutePreloadFunc };
}

// the instance is the provider component, so it (unlike an options object) is a function
function isRouterInstance(
  options: FlightDataCollectorOptions | RouterInstanceLike
): options is RouterInstanceLike {
  return typeof options === "function";
}

/**
 * Produces the `collectFlightData` implementation for
 * `configureServerFunctionsServer` (or `handleServerFunctionRequest`
 * options). Accepts a `createRouter` instance directly — its routes, base,
 * and `preload` are the single source of truth — or an options object for
 * trees not created through the factory.
 *
 * Strategy: rerun the route data for the URL the client will show
 * after the mutation — the redirect `Location` when the outcome carries
 * one, the referring page otherwise — collecting each `query` result under
 * its cache key, scoped to the outcome's `X-Revalidate` keys when present
 * (routes newly entered via redirect always collect fully). The returned
 * payload seeds the client router's cache through its registered
 * flight-data consumer.
 */
export function createFlightDataCollector(
  options: FlightDataCollectorOptions | RouterInstanceLike
): CollectFlightDataHook {
  const { routes, rootPreload, base = "" } = isRouterInstance(options)
    ? { routes: options.routes, rootPreload: options.config.preload, base: options.config.base }
    : options;
  if (!routes) throw new Error("createFlightDataCollector requires `routes`");
  let branches: Branch[] | undefined;
  let compiledVersion = -1;
  // thunks are called at first collection so per-request trees build lazily;
  // recompiled when a lazy subtree resolves (shared, append-only state)
  const resolveBranches = () => {
    const version = peekLazySubtrees();
    if (!branches || compiledVersion !== version) {
      branches = createBranches(typeof routes === "function" ? routes() : routes, base);
      compiledVersion = version;
    }
    return branches;
  };

  return async (sourceEvent, outcome) => {
    // no referrer, nothing to produce data for (e.g. non-browser callers)
    const referrer = outcome.request.headers.get("referer");
    if (!referrer) return undefined;
    // a raw body-carrying Response is the caller's verbatim payload — there
    // is no envelope to fold data into
    if (outcome.value instanceof Response && outcome.value.body) return undefined;

    const origin = new URL(outcome.request.url).origin;
    let revalidate: string[] | undefined;
    let url = new URL(referrer).toString();
    if (outcome.response) {
      if (outcome.response.headers.has(REVALIDATE_HEADER))
        revalidate = outcome.response.headers.get(REVALIDATE_HEADER)!.split(",");
      if (outcome.response.headers.has("Location"))
        url = new URL(outcome.response.headers.get("Location")!, origin + base).toString();
    }
    // redirects leaving the app can't be collected for
    if (new URL(url).origin !== origin) return undefined;

    // The flight event: the source event (its `response` rides along, so
    // cookies/headers set during preloads still reach the real response)
    // pointed at the target URL, with the mutation's own cookie mutations
    // folded into the request, in data-only router mode.
    const event = { ...sourceEvent } as RequestEvent;
    event.request = new Request(url, {
      headers: createSingleFlightHeaders(sourceEvent, outcome.response)
    });
    event.router = {
      dataOnly: revalidate || true,
      previousUrl: referrer,
      data: {}
    };

    return provideRequestEvent(event, async () => {
      try {
        await resolveLazyMatches(resolveBranches, url, referrer);
        runPreloads(event, resolveBranches(), url, referrer, rootPreload);
      } catch (error) {
        console.error(error);
      }
      const data = event.router!.data;
      if (!data) return undefined;
      let containsKey = false;
      for (const key in data) {
        if (data[key] === undefined) delete data[key];
        else containsKey = true;
      }
      return containsKey ? data : undefined;
    });
  };
}

// Lazy subtrees matched by the target (or previous) URL must resolve before
// the preload pass — the collector would otherwise be blind to inner routes'
// data. Resolution is shared with the client-side machinery (append-only,
// cached per thunk); the loop handles boundaries nested inside boundaries.
async function resolveLazyMatches(
  resolveBranches: () => Branch[],
  url: string,
  previousUrl: string
) {
  for (;;) {
    const branches = resolveBranches();
    const target = new URL(url);
    const matches = [
      ...getRouteMatches(branches, target.pathname),
      ...getRouteMatches(branches, new URL(previousUrl, target).pathname)
    ];
    const pending = matches.filter(m => m.route.lazy && !m.route.lazy.resolved);
    if (!pending.length) return;
    await Promise.all(pending.map(m => resolveLazySubtree(m.route.lazy!)));
  }
}

// The pure preload runner: the same collection loop the router's <Routes>
// component runs when it detects a data-only render (routers/components.tsx),
// driven directly off the route tree — matched routes' preloads run and
// their `query` calls store results on `event.router.data`. Routes not
// matched by the previous URL flip collection from the revalidation-key
// filter to everything (their queries have no client cache yet).
function runPreloads(
  event: RequestEvent,
  branches: Branch[],
  url: string,
  previousUrl: string,
  rootPreload?: RoutePreloadFunc
) {
  const target = new URL(url);
  const prevMatches = getRouteMatches(branches, new URL(previousUrl, target).pathname);
  const matches = getRouteMatches(branches, target.pathname);
  const location = {
    pathname: target.pathname,
    search: target.search,
    hash: target.hash,
    query: extractSearchParams(target),
    state: null,
    key: ""
  };
  // the root layout preloads first, exactly as <Root> would during a real
  // server render: merged params of every match, intent "initial" (there is
  // no navigation intent on the server), before any dataOnly-filter flip
  rootPreload && rootPreload({ params: mergeParams(matches), location, intent: "initial" });
  for (let match = 0; match < matches.length; match++) {
    if (!prevMatches[match] || matches[match].route !== prevMatches[match].route)
      event.router!.dataOnly = true;
    const { route, params } = matches[match];
    route.preload &&
      route.preload({
        params,
        location,
        intent: "preload"
      });
  }
}

/**
 * The request headers for the flight-data collection pass: the source
 * request's headers with the mutation's `Set-Cookie` mutations folded into
 * the `Cookie` header, so preloads observe the post-mutation cookie state
 * (deletions honored via Max-Age/Expires). Cookies attached to the
 * returned/thrown response itself (e.g. `redirect(to, { headers })`) never
 * reach the event response, but a browser round trip would have sent them
 * back with the next request — fold them in too, after the event's, so
 * they win on conflict.
 */
export function createSingleFlightHeaders(
  sourceEvent: {
    request: Request;
    response?: { headers?: Headers };
  },
  outcomeResponse?: Response
): Headers {
  return foldSetCookies(sourceEvent.request.headers, [
    ...(sourceEvent.response?.headers?.getSetCookie() ?? []),
    ...(outcomeResponse?.headers?.getSetCookie() ?? [])
  ]);
}
