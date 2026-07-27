---
"@solidjs/router": patch
---

Accept a server-side `url` prop on the router provider. A request event established by the server harness still takes precedence; the prop covers renders outside a request scope (SSG scripts, tests, runtimes without `node:async_hooks`), so one module-scope `createRouter` instance — and one compiled route tree — serves every URL (#579).

History adapters no longer locate a server render: `config.history` was the app-scoped carrier that forced a router instance per URL, and on the server only its `utils` now apply. Use `<Router url={...}>` where you previously passed `memoryHistory("/page")` for SSR/SSG.
