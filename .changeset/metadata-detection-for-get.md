---
"@solidjs/router": patch
---

`query()` no longer sniffs the legacy `.GET` property off server functions
(removed from the core runtime along with `.withOptions`). GET-ness is a
declaration now — a core `GET(fn)` reference already calls over GET, so
there is no transport to swap; where the router needs to *know*, the
detection contract is `getServerFunctionMetadata(fn)?.method === "GET"`
from `@solidjs/web/server-functions`. Undeclared server functions passed
to `query()` still get GET transport — query implies GET (see the
companion changeset): the upgrade is now a real `GET(fn)` declaration
instead of a property swap.
