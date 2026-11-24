---
"@solidjs/router": patch
---

Server link claims return early for a plain root-relative href that cannot be the current location or one of its parents, so those links skip href resolution and matching.
