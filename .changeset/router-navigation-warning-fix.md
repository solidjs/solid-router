---
"@solidjs/router": patch
---

Fix a client-side navigation rendering regression and remove a Solid 2 warning triggered during router setup.

This keeps route outlet consumption in a tracked render path and avoids reading the router source signal directly during construction.
