---
"@solidjs/router": patch
---

Fix the published package contents so `dist` no longer includes mirrored `src`, `test`, or co-located spec files.

Also move the data tests under `test/` and align the test TypeScript config with that layout so `test:types` continues to pass cleanly.
