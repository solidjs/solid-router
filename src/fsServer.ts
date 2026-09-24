import { query } from "./data/query.js";
import { serverRouteComponent } from "./serverRouteComponent.js";
import type { RouteSectionComponent } from "./types.js";

/**
 * The wrapper a server page's source goes through: `query` unless the route
 * config names another — `liveQuery`, imported by the route file that wants
 * it, so only that app carries it.
 */
export type ServerPageQuery = (fn: (...args: any[]) => any, key: string) => (...args: any[]) => any;

/**
 * The server page half of the fs adapter — the only importer of `query` and
 * `serverRouteComponent`. fs.ts reaches it behind `serverRoutes` from
 * `filesystem-routing/flags`, so an app with no server page never bundles it.
 */
export function serverRoute(
  fn: (...args: any[]) => any,
  key: string,
  config?: { query?: ServerPageQuery | undefined }
): RouteSectionComponent {
  return serverRouteComponent((config?.query ?? query)(fn, key));
}
