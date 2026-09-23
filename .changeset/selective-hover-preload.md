---
"@solidjs/router": patch
---

Hover/intent preload only runs a route level's data preload (its `preload` and a server component route's source call) when navigation would mount that level fresh or reuse it with changed inputs: the level's params, and search as the declared schema's validated output, or the raw search string when the route declares no schema. Previously every matched level re-ran on each hover, so a shared layout's preload fired on every link. Lazy component code preloads are unaffected.
