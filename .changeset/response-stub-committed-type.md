---
"@solidjs/router": patch
---

Add the `committed` flag to the `RequestEvent` response-stub type, mirroring core's `ResponseStub` (@solidjs/web 2.0.0-beta.29): integrations set it once the response head is sent, and `httpStatus`/`httpHeader` gate their writes and cleanup-time retractions on it. Lets integrations (e.g. solid-start) set the flag without casting around the router's augmentation.
