---
"@solidjs/router": patch
---

File-system routes can be server component pages. With `fileRoutes({ serverComponents: true })` on the `file-routes` plugin, a route file whose default export is a `"use server"` function of the route args becomes `serverRouteComponent(query(fn, key))` keyed by the file's path — or through the wrapper its `route` config names, `defineFileRoute(path, { query: liveQuery })`, which that file imports so only a live app carries it, so `revalidate("src/routes/stories")` reaches every page under a directory. `ServerRouteArgs<typeof route>` types `params` from the pattern and `search` from the schema's output. The wiring lives in a module the adapter reaches only behind `serverRoutes` from `filesystem-routing/flags` (a new optional peer), which the plugin folds from its scan, so apps without a server page bundle none of it; `pnpm build` asserts this. A code-split page that turns out to be a server function throws a directed error.
