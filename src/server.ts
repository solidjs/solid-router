// The router's server-side integration with the server function runtime
// (@solidjs/web/server-functions). Server-only entry (`@solidjs/router/server`):
// it reaches for node async context via @solidjs/web/storage — keep it out of
// client bundles.
//
// Two policies live here, both previously implemented inside SolidStart and
// now owned by the router (the vocabulary — query keys, submissions — is the
// router's):
//
// - single-flight mutations: `createFlightDataCollector` produces the
//   `collectFlightData` hook the app hands to
//   `configureServerFunctionsServer` (or the handler options). After a
//   mutation it produces the route data the mutation invalidated for the
//   page the client is on (or is being redirected to), which the handler
//   folds into the response — mutation and fresh data in one round trip.
// - the no-JS form convention: `createNoJSHandler` produces the
//   `handleNoJS` hook — form posts made without the client runtime redirect
//   back (303) carrying the outcome in a one-shot flash cookie that the
//   router's SSR initialization reads into submission state.
import { provideRequestEvent } from "@solidjs/web/storage";
import type { JSX, RequestEvent } from "@solidjs/web";
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
import { encodeFlashCookie } from "./data/flash.js";
import type { Branch, RouteDefinition, RoutePreloadFunc } from "./types.js";

export type { FlashSubmission } from "./data/flash.js";
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
      if (outcome.response.headers.has("X-Revalidate"))
        revalidate = outcome.response.headers.get("X-Revalidate")!.split(",");
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
    event.request = new Request(url, { headers: createSingleFlightHeaders(sourceEvent) });
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
 * (deletions honored via Max-Age/Expires).
 */
export function createSingleFlightHeaders(sourceEvent: {
  request: Request;
  response?: { headers?: Headers };
}): Headers {
  const headers = new Headers(sourceEvent.request.headers);
  const setCookies = sourceEvent.response?.headers?.getSetCookie() ?? [];
  if (!setCookies.length) return headers;

  const cookies: Record<string, string> = {};
  for (const pair of headers.get("cookie")?.split(";") ?? []) {
    const eq = pair.indexOf("=");
    if (eq > -1) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  for (const setCookie of setCookies) {
    const parsed = parseSetCookie(setCookie);
    if (!parsed) continue;
    if (
      (parsed.maxAge != null && parsed.maxAge <= 0) ||
      (parsed.expires != null && parsed.expires.getTime() <= Date.now())
    ) {
      delete cookies[parsed.name];
    } else {
      cookies[parsed.name] = parsed.value;
    }
  }
  headers.delete("cookie");
  const serialized = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  if (serialized) headers.set("cookie", serialized);
  return headers;
}

function parseSetCookie(setCookie: string) {
  const [pair, ...attributes] = setCookie.split(";");
  const eq = pair.indexOf("=");
  if (eq < 0) return undefined;
  const parsed: { name: string; value: string; maxAge?: number; expires?: Date } = {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim()
  };
  for (const attribute of attributes) {
    const attrEq = attribute.indexOf("=");
    const key = (attrEq < 0 ? attribute : attribute.slice(0, attrEq)).trim().toLowerCase();
    const value = attrEq < 0 ? "" : attribute.slice(attrEq + 1).trim();
    if (key === "max-age") parsed.maxAge = Number(value);
    else if (key === "expires") parsed.expires = new Date(value);
  }
  return parsed;
}

export interface NoJSHandlerOptions {
  /** The app's base path, for resolving redirect `Location`s. */
  base?: string;
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status#redirection_messages
const validRedirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * Produces the `handleNoJS` implementation for
 * `handleServerFunctionRequest` options: form posts made without the client
 * runtime redirect back to the referring page (or to the result's
 * `Location`) with the outcome riding a one-shot `flash` cookie. The
 * router's SSR initialization reads the cookie into submission state, so
 * `useSubmission()` renders the result exactly as a scripted submission
 * would — progressive enhancement with no app code.
 */
export function createNoJSHandler(options: NoJSHandlerOptions = {}) {
  const { base = "" } = options;
  return function handleNoJS(
    result: unknown,
    request: Request,
    args: unknown[],
    thrown?: boolean
  ): Response {
    const url = new URL(request.url);
    const back = request.headers.get("referer") || url.origin + base;
    // form post -> GET: 303 See Other unless the result names a redirect status
    let status = 303;
    let headers: Headers;
    if (result instanceof Response) {
      headers = new Headers(result.headers);
      if (result.headers.has("Location")) {
        headers.set(
          "Location",
          new URL(result.headers.get("Location")!, url.origin + base).toString()
        );
        if (validRedirectStatuses.has(result.status)) status = result.status;
      } else {
        headers.set("Location", back);
      }
    } else {
      headers = new Headers({ Location: back });
    }
    // Responses carry their meaning in their metadata; anything else flashes
    // the outcome for the next render's submission state.
    if (result && !(result instanceof Response)) {
      headers.append(
        "Set-Cookie",
        encodeFlashCookie(url.pathname + url.search, result, args, thrown)
      );
    }
    return new Response(null, { status, headers });
  };
}
