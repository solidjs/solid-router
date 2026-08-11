---
"@solidjs/router": patch
---

Update `solid-js` / `@solidjs/web` to `2.0.0-beta.33` and raise the peer floor to match (dom-expressions `0.50.0-next.41` line, resolved transitively from the registry). beta.33 publishes the pieces the router now reads through core: the server-function declaration/metadata registry and the late-bound RPC seam (`getServerFunctionRPC`) the transport fills, so the router's eager graph stays codec-free. The earlier beta.32 migration rides along: tests and docs moved off the removed `renderToStringAsync` — awaiting `renderToStream(...)` resolves with the settled HTML and is the fully-settled-string form of the streaming render.
