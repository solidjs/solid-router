---
"@solidjs/router": patch
---

Adopt path-based server function addressing (solidjs/solid#3076). Action urls are now `<endpoint>/<id>[?args=...]` — the id in the path, bound arguments staying in the query. The generic form-action fallback reads the id back through the runtime's `parseServerFunctionUrl` instead of parsing `?id=` by hand, so the router no longer hard-codes the addressing scheme. Requires `@solidjs/web` 2.0.0-rc.4; the peer floor is raised to `^2.0.0-rc.4`.
