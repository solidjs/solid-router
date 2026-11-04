---
"@solidjs/router": patch
---

A route `preload` that throws no longer leaves the router in preload mode. `usePreloadRoute`, link preloading and route mounting now reset their preload flags even when the preload throws. Before, one throwing preload made every later query read count as a preload, so query redirects and Responses were ignored for the rest of the session.
