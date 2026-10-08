---
"@solidjs/router": patch
---

Smaller link-preload strategies, with the same behavior. `intentPreload` and `tapPreload` register their listeners directly instead of through shared wrappers, and `usePreloadRoute` no longer allocates an options object when called with a URL alone.
