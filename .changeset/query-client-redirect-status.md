---
"@solidjs/router": patch
---

Follow client-side query redirects by status and origin. Keep local paths such as `/next` and server-function redirects relative to the router base. Other same-origin URLs use the history parser without adding the base again; targets outside the base, or URLs the integration cannot represent, navigate the document. A `Location` header on a non-redirect response stays data on the client, and the server-function carrier takes precedence. Server rendering is unchanged.
