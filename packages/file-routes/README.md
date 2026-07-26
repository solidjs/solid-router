# @solidjs/file-routes

Router-neutral file-system routing.

This package owns the *machinery* of file routing — scanning a directory,
applying a filename convention and producing a neutral **route manifest** —
while routers own the *shapes*: each router ships a small emission adapter
that turns the manifest into its own route definitions, and each bundler ships
a delivery adapter that materializes the manifest into code.

| Piece | Owner |
| --- | --- |
| Scanning, filename convention, neutral route manifest | `@solidjs/file-routes` |
| Nesting + `(group)` stripping | `@solidjs/file-routes/tree` |
| Vite delivery (virtual module, HMR, code splitting, build inputs) | `@solidjs/file-routes/vite` |
| `RouteDefinition` emission + `<FileRoutes>` | `@solidjs/router/fs` |
| Request handling for `GET`/`POST` routes, middleware | `@solidjs/start` |

Nothing here is Solid-specific: the core is bundler-agnostic — it never imports
Vite — the Vite adapter is router-agnostic, and the conventions are the ones
proven by SolidStart. The manifest is served from `virtual:file-routes`, or
from whatever id you pass as `fileRoutes({ moduleId })`.

## Usage with Solid Router and Vite

```ts
// vite.config.ts
import { fileRoutes } from "@solidjs/file-routes/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // `extensions` makes vite-plugin-solid also compile the `?pick=` route
  // modules this plugin emits (their ids end in a query string)
  plugins: [solid({ extensions: [".jsx", ".tsx"] }), fileRoutes()]
});
```

```tsx
// src/app.tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/router/fs";

export const App = () => (
  <Router root={props => <>{props.children}</>}>
    <FileRoutes />
  </Router>
);
```

Route modules live in `src/routes` (configurable via `fileRoutes({ dir })`).
A module is a page when it has a default export, and may export a `route`
config object:

```tsx
// src/routes/blog/[id].tsx
import type { RouteDefinition } from "@solidjs/router";

export const route = {
  preload: ({ params }) => loadPost(params.id)
} satisfies RouteDefinition;

export default function Post() {
  return <h1>Post</h1>;
}
```

## Filename convention

| File | Path |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `blog/[id].tsx` | `/blog/:id` |
| `blog/[[page]].tsx` | `/blog/:page?` |
| `docs/[...path].tsx` | `/docs/*path` |
| `(marketing)/about.tsx` | `/about`, nested in the `(marketing)` group |

Nested layouts come from pairing a file with a directory: `blog.tsx` is the
layout for everything in `blog/`.

The convention is pluggable — pass `toPath`/`toRoute` to a router, or a whole
custom router to the Vite plugin:

```ts
import { PageFileSystemRouter } from "@solidjs/file-routes";
import { fileRoutes } from "@solidjs/file-routes/vite";

fileRoutes({
  router: new PageFileSystemRouter({
    dir: "/absolute/path/to/routes",
    extensions: ["tsx"],
    toPath: routeFile => (routeFile.endsWith(".page") ? routeFile.slice(0, -5) : undefined)
  })
});
```

## The manifest seam

The scanner produces flat `RouteManifestEntry` objects:

```ts
{
  path: "/blog/:id",           // neutral pattern language
  page: true,
  $component: { src, pick },   // lazy module ref → code-split dynamic import
  $$route: { src, pick }       // eager module ref → static import
}
```

The Vite adapter serializes the manifest into the virtual module, turning
`$`-prefixed refs into dynamic imports and `$$`-prefixed refs into static
imports, each tree-shaken down to the picked exports. It serves two views of
the same entries:

```ts
import routes, { pageRoutes } from "virtual:file-routes";
```

`routes` is the flat manifest; `pageRoutes` is the page entries nested by path
with `(group)` segments stripped, so emission adapters don't each reimplement
the tree (`buildRouteTree` from `@solidjs/file-routes/tree` is the same
function, for consumers holding only a flat manifest). Emission adapters
import the module and emit their router's shape — see `@solidjs/router/fs` for
Solid Router's, a ~70 line adapter other routers can mirror.

Add `/// <reference types="@solidjs/file-routes/types" />` to type the import.

### Keeping path-derived types alive

A manifest is a runtime value, so a router that derives types from its route
table gets nothing from it — `@solidjs/router`'s `RoutePaths` degrades to `any`
the moment the table is a `RouteDefinition[]` rather than a tuple. Turn on
`types` and the plugin writes a declaration in which the manifest *is* a
literal tuple, regenerating it as routes come and go:

```ts
fileRoutes({ types: "file-routes.d.ts" })
```

Reference the generated file instead of `@solidjs/file-routes/types` — it is
self-contained, and two declarations of the same module conflict. Emission
adapters then have to preserve the tuple on the way through, which means a
mapping typed over its input rather than a plain `.map`:

```ts
declare function toRoutes<const T extends readonly Entry[]>(
  entries: T
): { [K in keyof T]: RouteFrom<T[K]> };
```

Frameworks with several Vite environments can serve a different router (and
convention) per environment, and have the plugin take every route module as a
build entry for the browser one:

```ts
fileRoutes({
  routers: {
    // the browser routes and renders
    client: new PageFileSystemRouter({ dir, extensions }),
    // the server also answers `GET`/`POST` exports, and in SPA mode routes
    // without shipping components
    ssr: new PageFileSystemRouter({ dir, extensions, httpMethods: true, components: ssr })
  },
  buildInputs: "client"
});
```

| Option | What it does |
| --- | --- |
| `httpMethods` | emit `$GET`, `$POST`, … refs for uppercase handler exports; a module with handlers but no default export routes without being a page |
| `components` | set `false` to route without emitting `$component` refs, keeping page modules out of that environment's bundle |
| `buildInputs` | environments whose build takes every code-split route module as an entry |
| `moduleId` | the id the manifest is served from |
| `optimizeDepsExclude` | packages importing the virtual module, kept out of dep prebundling (defaults to `@solidjs/router/fs`) |
| `types` | write a declaration typing the manifest as a literal tuple, kept in step with the route directory |
