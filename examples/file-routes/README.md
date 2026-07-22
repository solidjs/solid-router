# File routes example

A plain Vite + Solid Router SPA using file-system routing — no SolidStart.

- `@solidjs/file-routes/vite` scans `src/routes` and serves the route manifest
  from the `solid:file-routes` virtual module (see [vite.config.ts](vite.config.ts))
- `<FileRoutes />` from `@solidjs/router/fs` renders it as lazy, code-split
  route definitions (see [src/entry.tsx](src/entry.tsx))

```
src/routes/
├── index.tsx        →  /
├── about.tsx        →  /about
├── blog.tsx         →  layout for /blog/*
├── blog/
│   ├── index.tsx    →  /blog
│   └── [id].tsx     →  /blog/:id   (route config with preload)
└── [...404].tsx     →  catch-all
```

`blog/[id].tsx` also shows the code-splitting seam: its `route` export
(`preload`) is picked into the main bundle so data loading starts during
navigation, while the component stays in its own lazy chunk.

## Run it

From the repository root:

```sh
pnpm install
pnpm build          # builds @solidjs/router and @solidjs/file-routes first
cd examples/file-routes
pnpm dev
```
