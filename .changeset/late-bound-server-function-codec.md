---
"@solidjs/router": patch
---

Drop the eager `@solidjs/web/server-functions` imports from the router's
always-shipped graph (requires the solid release exporting the
server-function registry layer from the core entries). `query()` now reads
the `GET` declaration wrapper and `decodeResponse` through the late-bound
RPC seam (`getServerFunctionRPC` from `@solidjs/web`), which the transport
fills when a `'use server'` reference is created — and `routing.ts` takes
the flash-cookie helpers from the core entry, where they live beside the
cookie codec. An app using the router with zero server functions no longer
ships seroval + the `seroval-plugins/web` set + the fetch RPC client
(~7.5 KB gz eager in the basic template, measured); apps with server
functions behave exactly as before — the seam is filled before any
integration code can hold a reference. The action layer is untouched: it is
the transport's real consumer and only enters a bundle that uses actions
(or lazily, through the server-form submit path).
