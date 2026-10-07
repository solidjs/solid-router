---
"@solidjs/router": patch
---

Navigation coordination — query/preload intent, redirect hops, inherited replace/scroll and the leave-guard destination — reads the router's own location writes and `onSettled` instead of `isPending`/`latest`. No behavior change. `RouterIntegration.inflight` is replaced by `settled`.
