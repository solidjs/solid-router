---
"@solidjs/router": patch
---

Make the scroll-restoration effect hydration-transparent. Like the link-claims sweep, it is created in the router's client-only branch, so the server never allocates a hydration id for it — and since scroll restoration is on by default with browser history, every id allocated after it shifted by one child slot relative to the server. The visible failure was any `<Loading>` content that settled before the shell flush (a cache hit, a preloaded query): with no placeholder/stream-swap to mask the drift, the client missed both the serialized values and the inlined markup's claim keys, recomputed, and re-rendered the route fresh — duplicating the entire server-rendered subtree and leaving the visible copy inert. The effect now opts out of the id scheme with the `transparent` node option.
