---
"@solidjs/router": patch
---

Export `DefaultSearchTypes` and `SetSearchParams` from the package entry so consumer builds that emit declarations for an inferred `Router.paths` value don't fail with TS2742 ("cannot be named without a reference to .../dist/paths").
