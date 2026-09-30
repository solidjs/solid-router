---
"@solidjs/router": patch
---

Fix navigations hanging after hydration when a `query()` read ran inside Solid's hydration tracking run, where the global `Promise` and `fetch` are swapped for stubs that never settle (solidjs/solid#3721). Adopting a server value that had already settled wrapped it with that stubbed `Promise`, so the cache kept a promise that never settled. A boundary resuming more than 5s after boot treated the entry adopted at boot as stale and called the query function inside the tracking run, caching the same kind of promise. Adopted values are now wrapped with the native `Promise`, and a read with no navigation in flight while hydrating reuses the cached entry at any age, as adoption already did for server payloads. Navigations keep the normal freshness windows.
