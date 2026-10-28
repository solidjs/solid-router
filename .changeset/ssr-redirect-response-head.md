---
"@solidjs/router": patch
---

A server-side `navigate()` now writes its 302 status and `Location` header into the existing `event.response` instead of replacing the object. Headers already on the response, such as `Set-Cookie` and the flash-cookie clear, are kept, and a redirect issued after `createSSRResponse` captured the head still reaches it. Query redirects during SSR resolve `Location` against the router base as a result.
