---
"@solidjs/router": patch
---

The `@solidjs/router/fs` emission adapter consumes eagerly delivered manifests: a `$component` ref materialized with `filesystem-routing`'s `codeSplitting: false` arrives `require()`-shaped (statically imported), and `fileRoutes` passes its component through as-is — no `lazy()` wrapper, no suspense on first render — while code-split `import()` refs keep the `lazy` path unchanged.
