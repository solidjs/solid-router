/*
 * Type-only fixture, compiled by `test/exact-optional-types.spec.ts` with
 * `exactOptionalPropertyTypes: true` (the regular type test compiles it too,
 * without the flag). Under that flag an optional property only admits an
 * explicit `undefined` when its type says so — so route trees that carry
 * present-but-`undefined` keys, like the ones `filesystem-routing`'s
 * generated declaration describes and `fileRoutes` produces, must stay
 * assignable to `RouteDefinition` (#598).
 */
import { createRouter, defineRoute } from "../../src/index.js";
import { defineFileRoute, fileRoutes } from "../../src/fs.js";
import type { FileRouteEagerRef, FileRouteLazyRef } from "../../src/fs.js";
import type { RouteDefinition } from "../../src/types.js";

type Page = { default: () => null };

const postRoute = defineFileRoute("/users/:id", {
  preload: ({ params }) => params.id,
  info: { section: "users" }
});

// The nested `pageRoutes` view exactly as the plugin's `types` option
// declares it: absent refs and children are present-but-`undefined` keys.
declare const pageRoutes: readonly [
  {
    path: "/";
    id: "/";
    page: true;
    $component: FileRouteLazyRef<Page>;
    $$route?: undefined;
    children?: undefined;
  },
  {
    path: "/*404";
    id: "/*404";
    page: true;
    $component: FileRouteLazyRef<Page>;
    $$route?: undefined;
    children?: undefined;
  },
  {
    path: "/users";
    id: "/users";
    page: true;
    $component: FileRouteLazyRef<Page>;
    $$route?: undefined;
    children: readonly [
      {
        path: "/:id";
        id: "/:id";
        page: true;
        $component: FileRouteLazyRef<Page>;
        $$route: FileRouteEagerRef<{ route: typeof postRoute }>;
        children?: undefined;
      }
    ];
  }
];

// the adapter's output drops into a route tree...
const routes = fileRoutes(pageRoutes);
const _definitions: readonly RouteDefinition[] = routes;

// ...and into a router, with typed paths intact
const Router = createRouter({ routes: fileRoutes(pageRoutes) });
const _users: string = Router.paths.users(1)();
// @ts-expect-error not a route
Router.paths.nope;

// Hand-written definitions may spell absent properties out as `undefined`
const _explicit: RouteDefinition[] = [
  {
    path: "/",
    component: undefined,
    preload: undefined,
    children: undefined,
    matchFilters: undefined,
    search: undefined,
    info: undefined
  },
  { path: undefined, children: [{ path: "/nested" }] }
];

const _defined: RouteDefinition = defineRoute({
  path: "/defined/:id",
  component: undefined,
  preload: undefined,
  children: undefined,
  matchFilters: undefined,
  search: undefined,
  info: undefined
});

const _layout: RouteDefinition = defineRoute({
  component: undefined,
  preload: undefined,
  children: undefined,
  info: undefined
});

const _fileConfig: RouteDefinition = defineFileRoute("/file/:id", {
  preload: undefined,
  matchFilters: undefined,
  search: undefined,
  info: undefined
});

export {};
