---
"@solidjs/router": patch
---

fix #454 - default `RouteDefinition`'s data generic to `any` so typed components and preload functions are assignable in annotated configs like `const routes: RouteDefinition[]`, where no inference site for the generic exists
