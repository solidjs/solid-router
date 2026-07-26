import type { RouteManifestEntry } from "./manifest.ts";

/**
 * Nesting and group-stripping for the neutral route manifest.
 *
 * This module is deliberately free of Node and bundler imports: delivery
 * adapters run it at build time (the Vite adapter serializes the resulting
 * tree into the virtual module), and runtime consumers that receive only a
 * flat manifest can run it themselves.
 */

export interface RouteTreeEntry extends RouteManifestEntry {
  /** The manifest path this node was nested under, group segments included. */
  id: string;
  children?: RouteTreeEntry[];
}

/** Removes `(group)` segments from a route path: `/(app)/home` → `/home`. */
export function stripRouteGroups(path: string): string {
  return path.replace(/\([^)/]+\)/g, "").replace(/\/+/g, "/");
}

/**
 * Nests a flat manifest by path prefix and strips `(group)` segments, so
 * `/(app)/dashboard` renders at `/dashboard` inside the `/(app)` layout.
 *
 * Nested entries keep the path *relative to their parent*, which is what
 * nested routers expect. Pass only the entries that participate in the tree
 * (typically `entries.filter(entry => entry.page)`); the input is not
 * mutated.
 */
export function buildRouteTree(entries: readonly RouteManifestEntry[]): RouteTreeEntry[] {
  function processRoute(routes: RouteTreeEntry[], route: RouteManifestEntry, id: string) {
    const parentRoute = routes.find(o => id.startsWith(o.id + "/"));

    if (!parentRoute) {
      routes.push({ ...route, id, path: stripRouteGroups(id) });
      return;
    }

    processRoute(
      parentRoute.children || (parentRoute.children = []),
      route,
      id.slice(parentRoute.id.length)
    );
  }

  return [...entries]
    .sort((a, b) => a.path.length - b.path.length)
    .reduce((routes: RouteTreeEntry[], route) => {
      processRoute(routes, route, route.path);
      return routes;
    }, []);
}
