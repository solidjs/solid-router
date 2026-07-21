---
"@solidjs/router": patch
---

Make the `beforeLeave` guard machinery tree-shakeable. The router and history adapters now carry an empty slot instead of eagerly creating the guard; `useBeforeLeave` installs it on first use. Apps that never block navigation shed the whole confirm/retry/event machinery (~0.85 KB min / 0.27 KB gzip on the router-only client bundle). Depth stamping on history state stays always-on so back/forward blocking remains exact regardless of when the first guard subscribes.
