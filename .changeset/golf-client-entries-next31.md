---
"@solidjs/router": patch
---

Smaller client bundles, no behavior change: the `name` diagnostics on the router's internal memos are development-only (`DEV &&`, folded out of shipped builds), the segment matcher and match-filter lookup are a single expression, `query()` settles a cached or fresh read through one helper, the `keysFor()` instance method reuses `match()`'s pathname derivation, and a handful of one-use closures and repeated property chains (`window.history`, a form submit's `evt.target`, the paths proxy's `toString`/`Symbol.toPrimitive` branch) are folded. Production savings for a typical app (`createRouter` + `paths` links + `useNavigate` + `query` + `action`): ~440 bytes minified, ~80 bytes brotli on the router's share of the bundle.
