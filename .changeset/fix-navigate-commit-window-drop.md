---
"@solidjs/router": patch
---

Rebuild navigation commitment on Solid's transition engine. Programmatic and native navigation now write one canonical location source, repeated writes use engine last-write-wins, and history updates only after the winning transition settles. This fixes dropped soft navigations and native/programmatic races while preserving redirect options, pending link/search state, and lazy-route error delivery.
