import { lazy } from "solid-js";
import { isServerFunction } from "@solidjs/web";
import { serverRoutes } from "filesystem-routing/flags";

import * as server from "./fsServer.js";
import type { ServerPageQuery } from "./fsServer.js";
import type {
  DefinedRouteFilters,
  RouteDefinition,
  RouteParams,
  RoutePreloadFunc,
  RoutePreloadFuncArgs,
  RouteInfo,
  RouteSectionComponent,
  StandardSchemaV1,
  TypedRouteConfig,
  ValidFilters
} from "./types.js";

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
 *
 * Server pages (`fileRoutes({ serverComponents: true })` on the plugin): a
 * route file whose default export begins with `"use server"` arrives as an
 * eager ref flagged `server: true`, and becomes a server component route —
 * `serverRouteComponent(query(fn, key))` keyed by the file's path — or the
 * wrapper its `route` config names (`{ query: liveQuery }`), imported by that
 * file, so only an app with a live page carries `liveQuery`. The code lives
 * in fsServer.ts behind `serverRoutes`, a constant the plugin folds from the
 * scan, so apps without a server page never bundle it. This module itself
 * imports nothing server-component-shaped.
 */

/**
 * The type `defineFileRoute` hands back: `matchFilters` and `search` stay
 * literal — and only present when provided precisely, which is what the
 * `paths` machinery keys on once the manifest spreads this into the
 * definition — while `preload` widens back to the plain contract. The
 * pattern rides along as a phantom brand so `RouteProps<typeof route>`
 * can type the file's component from the same witness.
 */
export type FileRouteConfig<
  S extends string = string,
  T = unknown,
  F = undefined,
  Sch = undefined
> = TypedRouteConfig<S> &
  ([F] extends [undefined] ? {} : DefinedRouteFilters<S> extends F ? {} : { matchFilters: F }) &
  ([Sch] extends [undefined] ? {} : { search: Sch }) & {
    preload?: RoutePreloadFunc<T> | undefined;
    info?: RouteInfo | undefined;
    query?: ServerPageQuery | undefined;
  };

/**
 * Identity helper for a route file's `route` export that types `preload`'s
 * `args.params` from a pattern witness — the file's path pattern, which the
 * manifest (not this string) still provides at runtime:
 *
 * ```ts
 * // routes/blog/[id].tsx
 * export const route = defineFileRoute("/blog/:id", {
 *   matchFilters: { id: int },
 *   preload: ({ params }) => getPost(params.id) // params.id: string
 * });
 *
 * export default function Post(props: RouteProps<typeof route>) {} // params *and* data typed
 * ```
 *
 * `matchFilters` are validated against the pattern's params, and their
 * types (and any `search` schema) flow through the manifest into `paths`.
 */
export function defineFileRoute<
  S extends string,
  T = unknown,
  // See `defineRoute`: default-only so context-sensitive filter lambdas keep
  // `s: string` contextual typing, validity enforced at the property.
  const F = DefinedRouteFilters<S>,
  Sch extends StandardSchemaV1<any, any> | undefined = undefined
>(
  path: S,
  config: {
    matchFilters?: (F & ValidFilters<F, S>) | undefined;
    preload?: ((args: RoutePreloadFuncArgs<RouteParams<S>>) => T) | undefined;
    /** Standard Schema validator for this route's search params; its input type flows into the typed path proxy. */
    search?: Sch;
    info?: RouteInfo | undefined;
    /** For a server page: the wrapper its source goes through — `query` unless named, e.g. `liveQuery`. */
    query?: ServerPageQuery | undefined;
  }
): FileRouteConfig<S, T, F, Sch> {
  return config as FileRouteConfig<S, T, F, Sch>;
}

/** A code-split module ref: delivered as a dynamic import. */
export interface FileRouteLazyRef<M = Record<string, unknown>> {
  src: string;
  import(): Promise<M>;
}

/** An eager module ref: its picked exports are imported statically. */
export interface FileRouteEagerRef<M = Record<string, unknown>> {
  src?: string | undefined;
  require(): M;
}

/** The shape of a nested route-manifest entry the adapter consumes. */
export interface FileRouteEntry {
  path: string;
  page?: boolean;
  /** The page component is a `"use server"` function; its `$component` is an eager ref to the stub. */
  server?: boolean;
  /** Code-split by default; an eager ref when delivered with `codeSplitting: false` or for a server page. */
  $component?: FileRouteLazyRef<any> | FileRouteEagerRef<any> | undefined;
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
 * route definitions: code-split `$component` refs become `lazy` components
 * (their `src` doubles as the `moduleUrl` core resolves assets and islands
 * against), eager refs — a manifest delivered with `codeSplitting: false` —
 * pass their component through as-is (no `lazy` wrapper; the module is
 * already statically imported), and each entry's `route` config export is
 * spread into its definition. Pass the result to `createRouter({ routes })`.
 */
export function fileRoutes<const T extends readonly FileRouteEntry[]>(
  entries: T
): FileRoutesFrom<T> {
  const components = new Map<string, RouteSectionComponent>();

  const componentOf = (
    entry: FileRouteEntry,
    config: RouteDefinition & { query?: ServerPageQuery | undefined }
  ) => {
    const ref = entry.$component!;
    if ("require" in ref) {
      const component = (ref as FileRouteEagerRef<{ default: RouteSectionComponent }>).require()
        .default;
      // A server page: the stub is the source; the file is the key (unique,
      // and a directory prefix is a subtree for `revalidate`).
      return serverRoutes && entry.server
        ? server.serverRoute(component, (ref.src || entry.path).split("?")[0], config)
        : component;
    }
    let component = components.get(ref.src);
    if (!component) {
      // moduleUrl is lazy()'s third argument as of solid 2.0.0-rc.1 (options
      // moved second); route components are default exports, so no { export }.
      component = lazy(
        () =>
          ref.import().then(mod => {
            // A `"use server"` default the scanner did not see (behind a
            // wrapper call or a re-export) — or scanned without the plugin's
            // `serverComponents` option — was code-split like a client page.
            if (isServerFunction(mod.default))
              throw new Error(
                `Route module "${ref.src}" exports a server function as its page, but it was ` +
                  "delivered as a client page. Enable `serverComponents: true` on the " +
                  'file-routes plugin and make the `"use server"` directive the first ' +
                  "statement of the inline default export."
              );
            return mod as { default: RouteSectionComponent };
          }),
        undefined,
        ref.src
      );
      components.set(ref.src, component);
    }
    return component;
  };

  const toRoute = (entry: FileRouteEntry): RouteDefinition => {
    const config = (entry.$$route?.require().route ?? {}) as RouteDefinition;
    return {
      ...config,
      path: entry.path,
      component: entry.$component ? componentOf(entry, config) : undefined,
      info: { ...config.info, filesystem: true },
      children: entry.children ? entry.children.map(toRoute) : undefined
    };
  };

  return entries.map(toRoute) as FileRoutesFrom<T>;
}
