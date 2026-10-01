---
"@solidjs/router": patch
---

Claimed anchors and `useLinkState` now share one matching rule: `current` is the same path and query (parameter order and hash aside), `active` is the path only, exact or prefix, with the root link exact-only.

- `useLinkState().current` compares the query like `aria-current="page"` does, so on `/?filter=active` a link to `/` is no longer current.
- `useLinkState("/").active()` is no longer true on every page; the root link only matches exactly, as it already did for anchors.
- An `aria-current` the author set (for example `"step"`) is no longer overwritten with `"page"` when the link matches. The router only writes and removes the attribute where it set it, and still re-applies its own value after a server-component morph strips it.
