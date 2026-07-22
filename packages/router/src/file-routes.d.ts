/**
 * The virtual route manifest module served by a `@solidjs/file-routes`
 * delivery adapter (e.g. `@solidjs/file-routes/vite`).
 */
declare module "solid:file-routes" {
  const routes: import("./fs.js").FileRouteEntry[];
  export default routes;
}
