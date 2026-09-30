---
"@solidjs/router": patch
---

Keep query responses from changing an SSR page's content type or making it download as a file. Representation metadata such as `Content-Language`, `ETag` and `Last-Modified` also stays on the query response. Use `httpHeader()` from `@solidjs/web` to set these headers on the page itself.

Append cookies once per cached query result. New results can still update cookies, and redirects continue to work after streaming starts.
