---
"@solidjs/router": patch
---

Keep query response body headers (`Content-Type`, `Content-Length`, `Content-Encoding`, and `Transfer-Encoding`) off the SSR document response. Returned and thrown `respond()` envelopes no longer replace the document's HTML content type with JSON. Cookies, redirects, and other response metadata continue to propagate.
