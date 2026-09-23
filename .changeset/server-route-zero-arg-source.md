---
"@solidjs/router": patch
---

`serverRouteComponent` accepts a source that ignores its arguments — an app shell — after `query()` has typed it as `(...args: never[])`.
