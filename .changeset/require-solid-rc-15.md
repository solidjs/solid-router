---
"@solidjs/router": patch
---

Require solid-js / @solidjs/web 2.0.0-rc.15. Link and form claims follow rc.15's claim contract: an element's compiled mount claim fires once, after its initial attributes are applied, and later claims come from compiler-owned `href`/`action` writes or from `claimElementTree` sweeps (frame streams, morphs). The router's claim handlers are unchanged.
