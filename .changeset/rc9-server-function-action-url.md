---
"@solidjs/router": patch
---

Follow the `@solidjs/web` 2.0.0-rc.9 server-function url surface (solidjs/solid#3440): the form-post address parser the generic form-action fallback reads the function id through is now `parseServerFunctionActionUrl` (formerly `parseServerFunctionUrl`; `serverFunctionUrl` there now names the url a `GET()` reference's own call requests). Same url shape, same id — no behavior change.

Requires `@solidjs/web` 2.0.0-rc.9; the `solid-js` / `@solidjs/web` peer floor is raised to `^2.0.0-rc.9`.
