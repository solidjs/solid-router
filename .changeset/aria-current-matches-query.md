---
"@solidjs/router": patch
---

`aria-current="page"` now requires the query to match as well as the path, ignoring parameter order. On `/?filter=active`, a link to `/?filter=active` is current and a link to `/` is not; previously every link to `/` with any query was current. `data-active` and `data-pending` still compare the path only.
