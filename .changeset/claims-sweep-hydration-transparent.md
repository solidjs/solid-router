---
"@solidjs/router": patch
---

Make the link-claims sweep effect hydration-transparent. The sweep is created in the router's client-only branch, so the server never allocates a hydration id for it; when the client-side render effect consumed a child id during hydration, every subsequent id shifted by one slot relative to the server — lazy-route hydration lookups missed ("was not preloaded before hydration") and hydration finished with unclaimed server-rendered nodes. The effect now opts out of the id scheme with the `transparent` node option, the same mechanism component owners use.
