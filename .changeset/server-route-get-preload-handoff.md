---
"@solidjs/router": patch
---

`serverRouteComponent` with a bare `GET(fn)` source sends one request per link visit instead of two (#677). The router hands a preload's call to the next render with the same args, so the route mounts the result the hover or focus preload already started. The hand-off happens once, within the same 5 s window `query()` gives a preload. A later visit calls fresh, a failed preload makes the render retry, and concurrent preloads of the same args share one call. `query()` and `liveQuery()` sources are unchanged.
