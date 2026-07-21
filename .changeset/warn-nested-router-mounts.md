---
"@solidjs/router": patch
---

Warn in development when a router instance mounts inside another router. One router owns the session per app — location, history, delegation, link claims, preloading — and a second live instance fights it (stale content on click navigations, conflicting link attributes). Nested routing hasn't been supported since nested `<Routes>` was removed in 0.10; compose route trees in one `createRouter` config instead. Lazy route subtrees are the planned mechanism for definitions unknown at build time.
