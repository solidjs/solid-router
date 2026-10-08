import { runWithOwner, untrack } from "solid-js";
import { resolveLazySubtree, setInPreloadFn, setPreloadIntent, useRouter } from "./routing.js";
import { serverRouteArgs, serverRouteArgsEqual, serverRouteOf } from "./serverRouteShared.js";
import type {
  MaybePreloadableComponent,
  Params,
  RouteDescription,
  RouteMatch,
  RouterContext,
  SearchParams,
  TypedPath
} from "./types.js";
import { extractSearchParams, mockBase } from "./utils.js";

/**
 * Warms the routes `url` matches: their lazy components (and any lazy
 * subtree on the way) load, and with `preloadData` their `preload` functions
 * run under `intent: "preload"`. Only link preload strategies and
 * `usePreloadRoute` import it, so apps using neither don't ship it.
 */
export function preloadRoute(router: RouterContext, url: URL, preloadData?: boolean) {
  const next = router._match(url.pathname);
  // An unresolved lazy subtree in the chain: the placeholder's
  // component.preload (below) kicks the table load; once it lands,
  // preload again so the real inner routes warm too. Preloads are
  // speculative: a failed load (held sync throw or rejection) is ignored
  // here — the real navigation surfaces and retries it.
  const boundary = next.find(m => m.route.lazy && !m.route.lazy.resolved);
  if (boundary) {
    try {
      (resolveLazySubtree(boundary.route.lazy!) as Promise<unknown>).then(
        () => preloadRoute(router, url, preloadData),
        () => {}
      );
    } catch {}
  }
  // Data preloads run only for levels a navigation would mount fresh or
  // reuse with changed inputs: this level's params, and search as the
  // declared schema's output or else the raw string. Navigation itself is
  // already this selective (a matching level is reused and re-reads through
  // tracked params), so an unchanged level has nothing new to warm.
  let current: RouteMatch[] | undefined;
  try {
    current = untrack(router.matches);
  } catch {}
  const { location } = router;
  const query = extractSearchParams(url);
  const inputs = (p: Params, q: SearchParams, s: string, r: RouteDescription) => {
    const a = serverRouteArgs(r, p, q);
    a.search === undefined && (a.search = s);
    return a;
  };
  const prevIntent = setPreloadIntent("preload");
  for (let match in next) {
    const { route, params } = next[match];
    const { preload, component } = route;
    (component as MaybePreloadableComponent | undefined)?.preload?.();
    const now = current && current[match];
    const unchanged =
      now &&
      now.route.key === route.key &&
      serverRouteArgsEqual(
        inputs(params, query, url.search, route),
        inputs(now.params, location.query, location.search, route)
      );
    setInPreloadFn(true);
    preloadData &&
      !unchanged &&
      runWithOwner(router._routeOwner(), () => {
        // A server component route's data IS its call: warm the same
        // query entry the render will read, under the same derived args.
        const server = serverRouteOf(component);
        server && server.call(serverRouteArgs(route, params, query));
        preload &&
          preload({
            params,
            location: {
              pathname: url.pathname,
              search: url.search,
              hash: url.hash,
              query,
              state: null,
              key: ""
            },
            intent: "preload"
          });
      });
    setInPreloadFn(false);
  }
  setPreloadIntent(prevIntent);
}

/**
 * `usePreloadRoute` returns a function for warming a route by hand — the same
 * work link preloading triggers: the matched routes' lazy components load,
 * and with `preloadData` their `preload` functions run.
 *
 * @example
 * ```js
 * const preload = usePreloadRoute();
 *
 * preload(paths.users(2).settings, { preloadData: true });
 * ```
 */
export const usePreloadRoute = () => {
  const router = useRouter();
  return (url: string | URL | TypedPath, options?: { preloadData?: boolean }) =>
    preloadRoute(
      router,
      url instanceof URL ? url : new URL(String(url), mockBase),
      options?.preloadData
    );
};
