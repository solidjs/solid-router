---
"@solidjs/router": patch
---

Observe tier: the router declares the route the document arrived on, with the same `OBSERVE.attribution.withOrigin` call it makes for every navigation — around the work that builds its context (`initial: true` on the ref), on both sides. On the client this is the first `"navigation"` record (`initial: true`, `at` the document's navigation start, no write to wait for); on the server the same declaration names the request's `"render"` record (`RenderEvent.route`: the matched pattern, the path, the params). A consumer naming page loads and requests by route (`/users/:id` rather than one name per user) had this for every navigation but the first; now it has the first too. Nothing in production builds: `OBSERVE` is undefined there and the declaration folds out. Needs `solid-js` / `@solidjs/web` `2.0.0-rc.12` or later (`NavigationRef.initial`, `RenderEvent.route`); the peer ranges move to `^2.0.0-rc.12`.
