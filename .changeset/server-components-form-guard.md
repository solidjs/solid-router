---
"@solidjs/router": patch
---

Include the server-component form fallback only when `__SOLID_SERVER_COMPONENTS__` is true, so apps without server components drop that code.
