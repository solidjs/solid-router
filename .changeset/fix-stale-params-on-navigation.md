---
"@solidjs/router": patch
---

Fix params becoming undefined in outgoing components during navigation.

Route roots are now created under the `Routes` component owner so they survive re-runs of the route state memo (Solid 2 disposes roots created inside a computation when it re-runs). Each route context also gets params scoped to its own lifetime: they retain their last values while the route is being torn down, so effects and async fetches in outgoing components (e.g. kept alive by a `<Loading>` boundary) never observe another route's params. This also removes the incorrect fallback that could hand a route context another route's match during teardown.
