---
"@solidjs/router": patch
---

`serverRouteComponent()` mounts the server component through `@solidjs/web`'s `dynamicComponent` (new in 2.0.0-rc.14) instead of `dynamic`. Same contract and hydration shape, but it never references the element runtime that `dynamic` keeps for rendering tags, so a page with a server component route sheds it (about 17 KB minified in the `pnpm build` file-routes check). The README's advice for a server component route with a client half now names `dynamicComponent()` too.
