---
"@solidjs/router": patch
---

Require the async flash decoder (solidjs/solid#3239): the flash cookie is now encrypted, so the runtime's `decodeFlashCookie` returns a Promise and the `provideFlashDecoder` slot takes only that shape. The submissions seed carries the in-flight decode through the not-ready protocol from a lazy, hydration-transparent memo — a request that never reads submissions never decodes, the decode runs at most once, and the server-only memo consumes no hydration-id slot.
