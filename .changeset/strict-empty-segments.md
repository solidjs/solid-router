---
"@solidjs/router": patch
---

Paths with empty interior segments (doubled slashes, e.g. `//dash` or `/foo//bar`) no longer match routes and now render the not-found state instead of silently matching their collapsed form (#567). A single trailing slash is still tolerated. Doubled leading slashes are also no longer normalized away by the browser integration and parse correctly instead of being treated as protocol-relative URLs.
