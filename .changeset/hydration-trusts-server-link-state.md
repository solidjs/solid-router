---
"@solidjs/router": patch
---

Link claims trust the server's link state at hydration: an anchor the server marked is registered without resolving its URL, and is resolved on the first routing change. Anchors with an authored `aria-current`, and pages rendered without server link state, are resolved at claim as before.
