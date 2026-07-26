/**
 * The virtual route manifest module served by a `@solidjs/file-routes`
 * delivery adapter (e.g. `@solidjs/file-routes/vite`).
 *
 * Declared locally so `@solidjs/router` stays free of a dependency on the
 * file-routing packages; frameworks and apps that import the manifest
 * themselves reference `@solidjs/file-routes/types` instead.
 */
declare module "virtual:file-routes" {
  /** The flat manifest, in scan order. */
  const routes: import("./fs.js").FileRouteEntry[];
  export default routes;

  /** The page entries, nested by path with `(group)` segments stripped. */
  export const pageRoutes: import("./fs.js").FileRouteTreeEntry[];
}
