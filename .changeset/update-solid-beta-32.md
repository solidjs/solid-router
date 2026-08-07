---
"@solidjs/router": patch
---

Update `solid-js` / `@solidjs/web` to `2.0.0-beta.32` and raise the peer floor to match (dom-expressions `0.50.0-next.40` line). The router's own runtime code is unaffected; the only migration was in the test suite and docs, which moved off the removed `renderToStringAsync` — awaiting `renderToStream(...)` now resolves with the settled HTML and is the fully-settled-string form of the streaming render.
