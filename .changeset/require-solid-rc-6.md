---
"@solidjs/router": patch
---

Require solid-js 2.0.0-rc.6: earlier rcs wedge navigation forever when a lazy route reads a query gated behind another still-pending query (#595, fixed in core by solidjs/solid#3226). Adds a regression spec covering the gated-query navigation shape.
