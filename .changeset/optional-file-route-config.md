---
"@solidjs/router": patch
---

`defineFileRoute`'s config argument is now optional, so a route file that only needs the pattern to type its component can write `defineFileRoute("/pages/:slug")` instead of passing `{}`.
