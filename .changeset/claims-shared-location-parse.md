---
"@solidjs/router": patch
---

Claimed anchors share one parse of the location and base path instead of
re-parsing both per anchor, roughly halving the `URL` constructions link
state does at load and on every navigation sweep.
