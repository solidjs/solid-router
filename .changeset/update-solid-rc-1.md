---
"@solidjs/router": patch
---

Update `solid-js` / `@solidjs/web` to `2.0.0-rc.1` and raise the peer ranges to `^2.0.0-rc.1`. rc.1 moves `lazy()`'s `moduleUrl` to the third argument (`lazy(fn, options?, moduleUrl?)`), and `fileRoutes` now passes each entry's `src` there — on rc.0 that argument would be silently dropped, so the peer floor rides along.
