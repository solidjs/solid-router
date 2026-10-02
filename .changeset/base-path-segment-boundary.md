---
"@solidjs/router": patch
---

Respect a path-segment boundary when deciding whether a link is under the router's base path. Under base `/app`, a link to `/apple` or `/application/x` is no longer claimed for link state (`data-active`, `aria-current`, `data-pending`) or intercepted on click; `/app`, `/app/` and `/app/...` still are. Without a base, behavior is unchanged.
