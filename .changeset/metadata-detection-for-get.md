---
"@solidjs/router": patch
---

`query()` no longer sniffs the legacy `.GET` property off server functions
(removed from the core runtime along with `.withOptions`). GET-ness is a
declaration now — a core `GET(fn)` reference already calls over GET, so
there is no transport to swap; where the router needs to *know*, the
detection contract is `getServerFunctionMetadata(fn)?.method === "GET"`
from `@solidjs/web/server-functions`. Note this also retires the implicit
GET upgrade of undeclared server functions passed to `query()` — with the
handler now enforcing declared methods (405), declare reads with `GET(fn)`
to get cacheable GET transport.
