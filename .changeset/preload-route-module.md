---
"@solidjs/router": patch
---

Route preloading (matching a link's URL, loading lazy components and subtrees, running `preload` functions with `intent: "preload"`) moved out of the router core into its own module. Only link preload strategies and `usePreloadRoute` import it, so apps that use neither no longer ship it. No behavior change.
