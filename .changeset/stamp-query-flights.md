---
"@solidjs/router": patch
---

`query()` stamps the fetch it starts, and every wrapper it hands a reader, with when that fetch started (`OBSERVE.attribution.markFlight`, observe and dev builds only). Page data a route's preload started, and read a render pass later behind the page's lazy chunk, no longer reads as a waterfall to `ASYNC_WATERFALL` or `SSR_BOUNDARY_WATERFALL`. Takes effect with the solid release that carries the stamps on its core slot (solidjs/solid#4108); older versions ignore it.
