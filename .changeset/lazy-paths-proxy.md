---
"@solidjs/router": patch
---

Construct the typed `paths` proxy lazily on first access instead of eagerly in `createRouter`. On runtimes without `Proxy` support (some older smart TVs), creating a router no longer throws — only touching `instance.paths` does.
