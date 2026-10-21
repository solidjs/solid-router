---
"@solidjs/router": patch
---

`liveQuery(fn, key)` now declares a server function `live()` itself, so `liveQuery(fn, key)` gets the transport's live lifecycle (live address, `Last-Event-ID` resume, response-lifetime deaths, `Retry-After`) without wrapping by hand. An explicit `live(fn)` passes through untouched. Hydration takeover forwards the served value to the first connection, so an unchanged value costs nothing on the wire.
