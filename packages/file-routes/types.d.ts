/**
 * Types for the virtual route-manifest module served by the Vite delivery
 * adapter. Frameworks and apps that import the manifest directly reference
 * this file once:
 *
 * ```ts
 * /// <reference types="@solidjs/file-routes/types" />
 * ```
 *
 * These describe the manifest *as delivered*: the module refs the scanner
 * records as `{ src, pick }` reach the app as callable imports. A project
 * serving the manifest from a custom `moduleId` declares that id itself,
 * with the same two exports.
 */

declare module "virtual:file-routes" {
  /** A code-split ref: the delivery adapter emits it as a dynamic import. */
  export interface FileRouteLazyRef {
    src: string;
    import(): Promise<Record<string, unknown>>;
  }

  /** An eager ref: its picked exports are imported statically. */
  export interface FileRouteEagerRef {
    require(): Record<string, unknown>;
  }

  /** A flat entry of the route manifest. */
  export interface FileRouteEntry {
    /**
     * The route path in the neutral pattern language (`:param`, `:param?`,
     * `*rest`), with any grouping segments still present.
     */
    path: string;
    /** `true` when the module renders a page. */
    page?: boolean;
    /** The page component module. */
    $component?: FileRouteLazyRef;
    /** The route config (`route` export), when the module has one. */
    $$route?: FileRouteEagerRef;
    /** Refs added by convention extensions, e.g. `$GET` handlers. */
    [key: string]: unknown;
  }

  /** An entry of the nested `pageRoutes` view. */
  export interface FileRouteTreeEntry extends FileRouteEntry {
    /** The manifest path this entry was nested under, groups included. */
    id: string;
    children?: FileRouteTreeEntry[];
  }

  /** The flat route manifest, in scan order. */
  const routes: FileRouteEntry[];
  export default routes;

  /** The page entries, nested by path with grouping segments stripped. */
  export const pageRoutes: FileRouteTreeEntry[];
}
