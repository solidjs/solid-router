---
"@solidjs/router": patch
---

`query()` now follows a redirect carried in `X-Server-Function-Redirect` (#603). A `redirect()` thrown or returned inside a `"use server"` function wrapped in `query()` reaches a client-side read masked to a 200 with `Location` removed, so `query` settled with the `Response` as its value and the navigation completed as if the check had passed; it only redirected on a full page request. The carrier is decoded with the runtime's `decodeRedirectHeaderValue`, the way `action()` already does: same-origin targets navigate softly with `replace`, other origins navigate the document, `X-Revalidate` keys are honored, and the read stays pending on the client. The decoder is loaded with a dynamic import, so apps without server functions still do not ship the transport.
