---
"@solidjs/router": patch
---

fix #347 - accept `VoidComponent` pages as route components; `component` now takes a `RouteSectionComponent` union so components that don't declare `children` type-check, while components requiring props the router doesn't pass are still rejected
