---
"@solidjs/router": patch
---

Adopt the core server-function protocol from `@solidjs/web` (requires the
solid release shipping the `server-functions` subpath). The router's
`redirect`/`reload`/`json` response helpers are removed — import `redirect`,
`reload`, and `respond` from `@solidjs/web` instead. Actions and queries now
consume `ResponseEnvelope` values (what `respond()` returns) directly in
memory, and decode transport pass-through responses (redirects, revalidation,
single-flight payloads) themselves via `decodeResponse` from
`@solidjs/web/server-functions` — the `customBody` expando and the
`CustomResponse` type are gone (`NarrowResponse` now narrows through
`ResponseEnvelope`).
