# @solidjs/file-routes

Router-neutral file-system routing for Solid projects.

This package owns the *machinery* of file routing — scanning a directory,
applying a filename convention and producing a neutral **route manifest** —
while routers own the *shapes*: each router ships a small emission adapter
that turns the manifest into its own route definitions, and each bundler ships
a delivery adapter that materializes the manifest into code.

| Piece | Owner |
| --- | --- |
| Scanning, filename convention, neutral route manifest | `@solidjs/file-routes` |
| Vite delivery (virtual module, HMR, code splitting) | `@solidjs/file-routes/vite` |
| `RouteDefinition` emission + `<FileRoutes>` | `@solidjs/router/fs` |
| Server conventions (`GET`/`POST` exports, API routes, middleware) | `@solidjs/start` |

The core is bundler-agnostic — it never imports Vite — and the conventions are
the ones proven by SolidStart.

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

The Vite adapter serializes the manifest into the `solid:file-routes` virtual
module, turning `$`-prefixed refs into dynamic imports and `$$`-prefixed refs
into static imports, each tree-shaken down to the picked exports. Emission
adapters import that module and emit their router's shape — see
`@solidjs/router/fs` for Solid Router's, which is a ~100 line adapter other
routers can mirror.

Frameworks with several Vite environments can serve a different router (and
convention) per environment:

```ts
fileRoutes({
  routers: {
    client: new PageFileSystemRouter({ dir, extensions }),
    ssr: new MyServerFileRouter({ dir, extensions })
  }
});
```
