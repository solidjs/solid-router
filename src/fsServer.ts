// The server-page half of the file-routes adapter: the only module in the
// router that imports `query`, `liveQuery` and `serverRouteComponent`
// together. `fs.ts` imports it statically but reaches it only under
// `serverRoutes && entry.server`, where `serverRoutes` is the constant
// `filesystem-routing/flags` folds from the route scan — so in a build with
// no server page this module, and the frames runtime behind it, tree-shake
// out; in a build with one it is an ordinary static import, present at
// hydration. Nothing here is lazy: a server page's markup arrives as a
// frame the runtime must claim synchronously.
import { liveQuery } from "./data/liveQuery.js";
import { query } from "./data/query.js";
import { serverRouteComponent } from "./serverRouteComponent.js";
import type { RouteSectionComponent } from "./types.js";

/**
 * Turn a route file's `"use server"` default export into the route's
 * component: the same `serverRouteComponent(query(fn, key))` a hand-written
 * tree spells out, with the source policy chosen by the file's `route`
 * config (`live: true` → `liveQuery`) and the key derived by the adapter.
 */
export function serverRoute(
  fn: (...args: any[]) => any,
  key: string,
  config?: { live?: boolean }
): RouteSectionComponent {
  return serverRouteComponent((config?.live ? liveQuery : query)(fn, key));
}
