---
"@solidjs/router": patch
---

`<A>` sets `aria-current="page"` only when the link's query also matches the current location (parameter order aside), so filter links like `/?tag=a` and `/?tag=b` are no longer all marked as the current page. The active class still matches on the path only (#518).
