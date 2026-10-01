---
"@solidjs/router": patch
---

`aria-current` survives a server-component morph. The morph makes a link's attributes match the server's HTML, which never carries link state, and then re-claims the link; `data-active` and `data-pending` came back, but `aria-current` stayed stripped because the router only wrote it when its own record said the value had changed. It is now checked against the element on every re-claim.
