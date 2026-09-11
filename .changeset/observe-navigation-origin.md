---
"@solidjs/router": patch
---

Navigations are declared to Solid's observe tier. Every client location write — `navigate()`, a redirect chased while the previous target is still pending, the browser's own back/forward — now runs inside `OBSERVE.attribution.withOrigin` with the parametrized route pattern, params, and origin location, so the attribution engine names holds and re-runs after the route (`navigation to /users/:id (/users/42)`), times the navigation from the user event to settle, folds redirect hops onto the navigation they belong to (`redirected from /files`), and reports routes in `feedback().navigations`. The route name and params are read late — at settle — so a lazy route subtree that loaded during the hold is named by the exact route it resolved to, not its placeholder. The router's location signal and its `matches`, `routingPending`, and lazy-subtree memos carry names so they read as themselves in diagnostics rather than as `signal`/`computed`.

Nothing changes in production builds: `OBSERVE` is undefined there and the declaration folds out. Requires `solid-js` 2.0.0-rc.8 (`OBSERVE.attribution.withOrigin`).
