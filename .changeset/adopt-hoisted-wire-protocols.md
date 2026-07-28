---
"@solidjs/router": patch
---

Adopt the wire protocols the server function runtime absorbed from the router. The flash cookie (name/detect/clear and the codec), the `Set-Cookie`-folding half of `createSingleFlightHeaders`, and the no-JS form convention now live in `@solidjs/web/server-functions`; the router's copies and shims are deleted. `createNoJSHandler` is no longer exported from `@solidjs/router/server` — the runtime applies the convention to browser form posts by default, and apps that need to configure it (e.g. a base path) import it from `@solidjs/web/server-functions/server`. The router keeps its two real opinions: `createSingleFlightHeaders` still folds the mutation outcome's cookies after the event's (so they win on conflict), and SSR still seeds the decoded flash cookie into submission state — with the decoder now installed only on the server, so client bundles tree-shake the codec they never ran. Requires `@solidjs/web` >= 2.0.0-beta.27.
