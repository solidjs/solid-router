/**
 * The neutral route manifest.
 *
 * A file-system router produces a flat list of `RouteManifestEntry` objects.
 * The manifest is deliberately router-agnostic: it records paths, params,
 * module refs and export info, but says nothing about how a router turns
 * those into its own route definitions. Each router ships a small emission
 * adapter for that (e.g. `@solidjs/router/fs` emits `RouteDefinition`s),
 * and each bundler ships a delivery adapter (e.g. `@solidjs/file-routes/vite`
 * serializes the manifest into a virtual module).
 */

/**
 * A reference to a subset of a route module's exports.
 *
 * Delivery adapters materialize refs into code. The key the ref is stored
 * under decides how:
 * - keys prefixed `$` become lazy refs: `{ src, import: () => import(...) }`
 * - keys prefixed `$$` become eager refs: `{ require: () => ({ ...exports }) }`
 */
export interface ModuleRef {
  /** Absolute path of the source module. */
  src: string;
  /** The named exports (or `"default"`) this ref selects from the module. */
  pick: string[];
}

export interface RouteManifestEntry {
  /**
   * The route path in the neutral pattern language proven by SolidStart:
   * `:param`, `:param?` (optional) and `*rest` (catch-all) segments.
   * Group segments (`(name)`) are retained; emission adapters decide how
   * to nest and strip them.
   */
  path: string;
  /** `true` when the module renders a page (has a default export). */
  page?: boolean;
  /** Lazy ref to the page component module. */
  $component?: ModuleRef;
  /** Eager ref to the route config (`route` export), when present. */
  $$route?: ModuleRef;
  /**
   * Additional refs and metadata added by convention extensions, e.g. a
   * server convention may add `$GET`/`$POST` handler refs. Keys prefixed
   * `$`/`$$` are treated as lazy/eager module refs by delivery adapters.
   */
  [key: string]: unknown;
}
