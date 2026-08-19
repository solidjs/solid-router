---
"@solidjs/router": patch
---

Failed lazy route subtree loads are no longer cached for the rest of the session. The rejection is held for the current location (so the erroring match computation can't refire the import in a loop), and the next navigation retries the fetch — the same contract the platform applies to failed dynamic imports and `lazy()` adopted in solid 2.0.0-rc.1. Failed loads also no longer surface as unhandled promise rejections, and a speculative preload that fails is silently deferred to the real navigation.
