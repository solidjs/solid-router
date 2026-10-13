---
"@solidjs/router": patch
---

`intentPreload` preloads a link once per visit whichever intent comes first: a focus or touch on a link that already preloaded no longer preloads it again, and cancels a pending hover preload. A click after a hover, or a click with no dwell, now sends one preload instead of two.
