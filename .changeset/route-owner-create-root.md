---
"@solidjs/router": patch
---

The router's route-root owner now comes from `createRoot(() => getOwner())` rather than `createOwner()`. Since solid#4444, the public `createOwner` binds `dispose` on each owner it returns, and the router never calls that `dispose`, so router pages no longer ship the bind (−50 to −62 B minified on the solid repo's router size scenarios).
