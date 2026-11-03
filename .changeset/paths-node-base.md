---
"@solidjs/router": patch
---

Under a `base`, `navigate(paths.about)` and `useLinkState(paths.about)` no longer add the base twice. A paths node already includes the base, so with `base: "/app"` they gave `/app/app/about`. They now use the node's path as-is and give `/app/about`. `useLinkState(paths.about)` also works under `hashHistory`, where it never reported the link as current before.
