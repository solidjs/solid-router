---
"@solidjs/router": patch
---

Update to Solid 2.0.0-beta.18. JSX types now come from `@solidjs/web` (core `solid-js` no longer exports the `JSX` namespace), so the `<A>` anchor attribute augmentation moved to `@solidjs/web/jsx-runtime` and `RouterIntegration.signal` is now a plain getter/setter pair instead of solid's branded `Signal` type. Peer dependency floor raised to `2.0.0-beta.18`.
