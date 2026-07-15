---
"@solidjs/router": patch
---

fix #497 - `revalidate` now forces the cache miss synchronously instead of deferring it into the transition microtask, so a same-tick `refetch()` after an un-awaited `revalidate()` refetches fresh data
