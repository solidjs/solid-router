---
"@solidjs/router": patch
---

`query()` automatically declares GET transport for server functions. The
router primitive is the declaration site: passing a server function to
`query()` wraps it with core `GET(fn)` at query-creation time (module
scope), so the server half records the method declaration for dispatch and
the client half calls over cacheable GET — no manual wrapping needed.
Explicitly `GET(fn)`-declared references pass through unchanged, and
non-server functions are untouched. The declaration grants GET without
revoking POST, so the same function stays callable directly over the
default transport.
