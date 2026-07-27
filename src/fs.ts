import { lazy } from "solid-js";

import type { RouteDefinition, RouteSectionComponent } from "./types.js";

/*
 * The emission adapter for `file-routes` manifests: turns the nested
 * `pageRoutes` view of a route manifest into `RouteDefinition`s.
 *
 * This module never imports the virtual manifest itself — the app does, so
 * the adapter works with any delivery mechanism and any configured module
 * id, and needs no dep-optimizer exclusions:
 *
 * ```ts
 * import { pageRoutes } from "virtual:file-routes";
 * import { fileRoutes } from "@solidjs/router/fs";
 *
 * const router = createRouter({ routes: fileRoutes(pageRoutes) });
 * ```
 *
 * Typed paths survive the conversion: with the plugin's `types` option
 * generating a literal-tuple declaration for the virtual module, the `const`
 * type parameter and the mapped tuple below carry every `path` literal — and
 * each route module's `route` export, `matchFilters` and `search` included —
 * into `RoutePaths`.
 */

/** A code-split module ref: delivered as a dynamic import. */
export interface FileRouteLazyRef<M = Record<string, unknown>> {
  src: string;
  import(): Promise<M>;
}

/** An eager module ref: its picked exports are imported statically. */
export interface FileRouteEagerRef<M = Record<string, unknown>> {
  require(): M;
}

/** The shape of a nested route-manifest entry the adapter consumes. */
export interface FileRouteEntry {
  path: string;
  page?: boolean;
  $component?: FileRouteLazyRef<any> | undefined;
  $$route?: FileRouteEagerRef<any> | undefined;
  children?: readonly FileRouteEntry[] | undefined;
}

type RouteConfigOf<E> = E extends { $$route: { require(): { route: infer R } } } ? R : {};

/**
 * One manifest entry as a route definition. `children` is a required key on
 * purpose: an optional key infers as `C | undefined`, and that union
 * distributes `RoutePaths` into an uncallable shape.
 */
export type FileRouteFrom<E> = RouteConfigOf<E> & {
  path: E extends { path: infer P extends string } ? P : never;
  component: E extends { $component: object } ? RouteSectionComponent : undefined;
  children: E extends { children: infer C extends readonly FileRouteEntry[] }
    ? FileRoutesFrom<C>
    : undefined;
};

export type FileRoutesFrom<T extends readonly FileRouteEntry[]> = {
  [K in keyof T]: FileRouteFrom<T[K]>;
};

/**
 * Converts the nested page entries of a file-system route manifest into
 * route definitions: `$component` refs become code-split `lazy` components
 * (their `src` doubles as the `moduleUrl` core resolves assets and islands
 * against), and each entry's `route` config export is spread into its
 * definition. Pass the result to `createRouter({ routes })`.
 */
export function fileRoutes<const T extends readonly FileRouteEntry[]>(
  entries: T
): FileRoutesFrom<T> {
  const components = new Map<string, RouteSectionComponent>();

  const componentOf = (ref: FileRouteLazyRef) => {
    let component = components.get(ref.src);
    if (!component) {
      component = lazy(ref.import as () => Promise<{ default: RouteSectionComponent }>, ref.src);
      components.set(ref.src, component);
    }
    return component;
  };

  const toRoute = (entry: FileRouteEntry): RouteDefinition => {
    const config = (entry.$$route?.require().route ?? {}) as RouteDefinition;
    return {
      ...config,
      path: entry.path,
      component: entry.$component ? componentOf(entry.$component) : undefined,
      info: { ...config.info, filesystem: true },
      children: entry.children ? entry.children.map(toRoute) : undefined
    };
  };

  return entries.map(toRoute) as FileRoutesFrom<T>;
}
