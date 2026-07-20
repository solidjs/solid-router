---
"@solidjs/router": major
---

Begin the 1.0 API redesign: routes become config objects created outside JSX through a `createRouter` factory, and the route tree becomes the single source of truth for matching *and* types.

- `createRouter({ routes, ... })` returns an instance that is itself the provider component (`<Router>{props => ...}</Router>`); the render-prop child replaces the `root` prop and receives the matched content as `props.children`. The factory's `preload` option replaces `rootPreload`.
- `Router.paths` is a typed path proxy derived from the route tree: property access descends static segments, calls bind params (`paths.users(id).settings`), and zero-arg or search-object calls terminate to a string (`paths.search({ q, page })`). Param types flow from `matchFilters` (new `int` filter types params as numbers) and search types from an optional per-route Standard Schema `search` validator. Every node coerces via `toString`, and `navigate()`/`useParams()` accept paths nodes.
- `Router.match(url)` matches arbitrary URLs against the instance with no rendering or request context — for middleware, sitemaps, and tests.
- History adapters are imported values (`hashHistory()`, `memoryHistory(initialUrl?)`, `browserHistory()`) passed as `config.history`, so unused adapters never enter the bundle; the default is browser history on the client and the request URL on the server.
- BREAKING: the low-level `createRouter` integration factory export is replaced by the new factory (custom integrations become history adapters). The JSX `<Router>`/`<HashRouter>`/`<MemoryRouter>`/`<StaticRouter>` components and `<Route>` remain for now and will be removed later in the 1.0 line.
- Fixes `rootPreload`'s return value being dropped: the root section's `data` prop now receives the preload result.
