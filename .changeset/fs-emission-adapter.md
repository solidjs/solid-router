---
"@solidjs/router": minor
---

Add the `@solidjs/router/fs` emission adapter: `fileRoutes(entries)` converts a neutral `filesystem-routing` manifest into `RouteDefinition`s, wiring `lazy()` components (with `moduleUrl` for route assets) and spreading `route` config, while preserving literal types so `RoutePaths` keeps working for typed navigation.
