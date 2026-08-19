---
"@solidjs/router": patch
---

A failed lazy route subtree load now surfaces to the nearest error boundary like a failed `lazy()` component, instead of silently stalling the navigation on the old screen. The failure is not cached: the rejection is held only through its settlement flush (so the erroring match computation delivers it once rather than refiring the import in a loop), and any later attempt — an error boundary `reset()`, a new navigation — re-fetches, matching the platform's contract for failed dynamic imports and `lazy()` in solid 2.0.0-rc.1. Failed loads no longer surface as unhandled promise rejections, and a speculative preload that fails defers silently to the real navigation.
