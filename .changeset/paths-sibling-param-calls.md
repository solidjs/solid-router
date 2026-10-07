---
"@solidjs/router": patch
---

Typed `paths`: sibling routes that share a param prefix now merge at the param call, so `/posts/:id` (or the file-system `/posts/:id/`) next to `/posts/:id/edit` types `paths.posts(1).edit()` and `paths.posts(1)()` alike, in either declaration order. Each sibling used to contribute its own call signature, and a call resolves to the first one only (#652).
