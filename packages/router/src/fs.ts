/*@refresh skip*/

import { lazy, type Component, type JSX } from "solid-js";
import { pageRoutes } from "virtual:file-routes";
import type { RouteDefinition } from "./types.js";

/**
 * Solid Router's emission adapter for `@solidjs/file-routes`.
 *
 * A file-system routing delivery adapter (e.g. `@solidjs/file-routes/vite`)
 * serves the router-neutral route manifest from the `virtual:file-routes`
 * module — already nested by path and stripped of `(group)`
 * segments under its `pageRoutes` export — and this module turns it into
 * Solid Router's own shape: `RouteDefinition`s with lazy components.
 */

/** A code-split ref to a route module produced by a delivery adapter. */
export interface FileRouteLazyRef {
  src: string;
  import(): Promise<Record<string, unknown>>;
}

/** An eagerly required ref to a route module produced by a delivery adapter. */
export interface FileRouteEagerRef {
  require(): Record<string, unknown>;
}

/** A flat entry of the neutral route manifest. */
export interface FileRouteEntry {
  /**
   * Route path in the neutral pattern language (`:param`, `:param?`,
   * `*rest`), with `(group)` segments still present.
   */
  path: string;
  /** `true` when the module renders a page. */
  page?: boolean;
  /** The page component module. */
  $component?: FileRouteLazyRef;
  /** The route config (`route` export), when present. */
  $$route?: FileRouteEagerRef;
  [key: string]: unknown;
}

/** A nested entry of the manifest's `pageRoutes` view. */
export interface FileRouteTreeEntry extends FileRouteEntry {
  children?: FileRouteTreeEntry[];
}

// Cached by source path so a module that appears in several routes only
// creates one lazy component and is only fetched once.
const components = new Map<string, Component>();

function createRoute(entry: FileRouteTreeEntry): RouteDefinition {
  let component: Component | undefined;
  if (entry.$component) {
    component = components.get(entry.$component.src);
    if (!component) {
      component = lazy(entry.$component.import as () => Promise<{ default: Component }>);
      components.set(entry.$component.src, component);
    }
  }

  const config = (entry.$$route ? entry.$$route.require().route : undefined) as
    | (Omit<Partial<RouteDefinition>, "path" | "component" | "children"> & {
        info?: Record<string, unknown>;
      })
    | undefined;

  return {
    ...config,
    path: entry.path,
    component,
    info: {
      ...config?.info,
      filesystem: true
    },
    children: entry.children ? entry.children.map(createRoute) : undefined
  };
}

/** Turns the manifest's nested page routes into `RouteDefinition`s. */
export function createFileRoutes(routes: FileRouteTreeEntry[]): RouteDefinition[] {
  return routes.map(createRoute);
}

let routes: RouteDefinition[] | undefined;

/**
 * Renders the file-system routes served by a `@solidjs/file-routes` delivery
 * adapter. Place it as `<Router>` children:
 *
 * ```tsx
 * import { Router } from "@solidjs/router";
 * import { FileRoutes } from "@solidjs/router/fs";
 *
 * const App = () => (
 *   <Router root={Layout}>
 *     <FileRoutes />
 *   </Router>
 * );
 * ```
 */
export function FileRoutes(): JSX.Element {
  return (routes ??= createFileRoutes(pageRoutes)) as unknown as JSX.Element;
}
