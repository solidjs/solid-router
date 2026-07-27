---
"@solidjs/router": minor
---

Explicit scroll restoration for back/forward navigation is on by default (#577). Positions are captured per history entry (persisted across reloads) and restored once the navigation settles, retrying as the document grows when content commits late — replacing the browser heuristic that loses the saved offset whenever the destination route forces a layout while the document is still short. Opt out with `scrollRestoration: false` in the `createRouter` config. Custom `history` adapters own their session and are not wrapped implicitly; pass `scrollRestoration: true` to thread restoration through one.
