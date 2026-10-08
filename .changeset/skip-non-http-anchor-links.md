---
"@solidjs/router": patch
---

Anchor click handling no longer intercepts links with a non-http(s) scheme (`blob:`, `mailto:`, `tel:`, `data:`, …). Previously `blob:` links could be wrongly routed because they inherit the page origin and bypassed the same-origin check.
