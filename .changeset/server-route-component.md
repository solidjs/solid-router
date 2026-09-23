---
"@solidjs/router": patch
---

Add `serverRouteComponent` (experimental): use a server component — a `"use server"` function that returns a component — as a route's `component` directly, with no client wrapper. The router derives the call's arguments from the match (`params` for this route's pattern and its ancestors', never a child's; `search` only when the route declares a schema), mounts the resolved component with the outlet as `children`, and drives the same call from link-intent preload and the single-flight collector, so one `query` entry serves render, preload, and mutation responses. `children` is the only client position the router fills; a server component requiring other client props is rejected at the type level — that route has a client half and stays an ordinary route component. New types: `ServerRouteArgs`, `ServerRouteFunction`. Apps that never call the helper pull in none of it: the router core reads only a brand off the route component.
