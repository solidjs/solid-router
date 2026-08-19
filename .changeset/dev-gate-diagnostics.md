---
"@solidjs/router": patch
---

Developer diagnostics (the nested-router warning, the relative-routing-unsupported warning, the invalid-path error log) are now gated behind solid's `DEV` flag, so app bundlers fold them out of production bundles.
