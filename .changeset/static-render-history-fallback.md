---
"@solidjs/router": patch
---

Server renders without a request event (SSG scripts, server-side tests) take
the location from the configured history adapter, so
`createRouter({ routes, history: memoryHistory("/page") })` renders that page
isomorphically — the replacement for `<StaticRouter url>`. With a request
event the URL still comes from the request; the fallback stays a static read
(no signal machinery), so server bundles are unchanged and history adapters
remain opt-in imports.
