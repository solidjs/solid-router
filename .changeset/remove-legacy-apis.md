---
"@solidjs/router": major
---

Remove the legacy component API. The `createRouter` factory (routes as config
objects, the instance as the provider component) is now the only way to set up
the router, and plain `<a>` elements — managed by the compiler-claimed anchor
integration — are the only link primitive.

Removed:

- `<Router>`, `<HashRouter>`, `<MemoryRouter>`, `<StaticRouter>` and the
  `createRouterComponent` integration wrapper. Use
  `createRouter({ routes, history })` with the `browserHistory` (default),
  `hashHistory`, or `memoryHistory` adapters; on the server the request URL
  drives a static integration automatically.
- JSX `<Route>` (and its `RouteProps` type). Routes are config objects —
  the single source of truth the typed path proxy infers from.
  `createFlightDataCollector` likewise no longer accepts JSX trees; hand it
  config objects, an array, a thunk, or a router instance.
- `<A>` and `Navigate`. Anchors are plain `<a href>` elements: the claims
  integration applies `aria-current="page"`, `data-active`, and
  `data-pending` automatically, and `useLinkState` remains the escape hatch
  for custom client links. For `Navigate`-style declarative redirects, call
  `useNavigate()` in the route component or redirect from a preload.
- The `create` hook on `RouterIntegration` (only the legacy components
  called it).

Renamed:

- `useCurrentMatches` is now `useMatches` — same behavior, an accessor of
  every match for the current location, outermost first.
- `usePreloadRoute` keeps its name and now also accepts typed path nodes
  (`paths.users(2).settings`) alongside strings and URLs.

`hashParser` moved to `src/routers/history.ts` (exported for integrations);
`createMemoryHistory` is replaced by the `memoryHistory(initialPath)` adapter,
which carries `go`/`back`/`forward`/`listen` for tests and tools.
