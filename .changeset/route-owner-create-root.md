---
"@solidjs/router": patch
---

The router's route-root owner now comes from `createRoot(() => getOwner())` instead of `createOwner()`. `createOwner` is leaving solid-js's public types (solid#4515, typed only through `solid-js/internal`), and this uses only public API with the same parent, hydration ids and disposal.
