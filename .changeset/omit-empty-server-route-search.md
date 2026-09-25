---
"@solidjs/router": patch
---

Server route args omit the `search` key when the route declares no search schema (#615). The explicit `search: undefined` failed the runtime's JSON-safety check on client navigation (arguments travel as plain JSON by default), so every schema-less server route rendered its error boundary instead of the page — SSR was unaffected, making the break client-nav-only. Destructuring on the server reads identically, and `ServerRouteArgs` now types `search` as optional exactly when no schema narrows it.
