---
"@solidjs/router": patch
---

The flash cookie is now detected, cleared and decoded once per request rather than once per router instance. A server render can re-create the router while it retries a suspension — a `useSubmissions` read under `<Errored>`, inside a document shell, retries from above the router — and each new router restarted the decode, so the render never settled and the stream retried until the process ran out of memory. Each re-created router also appended another `Set-Cookie` clear.
