---
"@solidjs/router": patch
---

Resolve a path that starts with `//` as a path in the observe tier's navigation declarations, so a request for `//` no longer crashes the dev server with `diagnostics: true` (#752)
