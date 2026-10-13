---
"@solidjs/router": patch
---

Server-rendered anchors carry link state (#654). The router sets the render's
link handler (`setLinkClaim` from `@solidjs/web`), so plain anchors arrive with
`data-active` and `aria-current="page"` in the server HTML instead of gaining
them only after hydration, and pages that never hydrate mark the current page
too. When the client claims an anchor from that HTML, it treats a
server-written `aria-current` as its own and removes it on navigation. The peer
floor for `@solidjs/web` and `solid-js` is raised to `^2.0.0-rc.15`.
