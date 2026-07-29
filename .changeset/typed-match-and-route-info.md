---
"@solidjs/router": patch
---

`useMatch` joins the typed family: the returned match's `params` are typed from the pattern you pass (`useMatch(() => "/docs/:page")` gives `params.page: string`), and it now accepts typed path nodes (`useMatch(() => paths.users(2))`), coercing them to their URL. `PathMatch` gains an optional params type parameter (defaulting to `Params`, non-breaking). Route `info` metadata is now typed by an augmentable `RouteInfo` interface — `declare module "@solidjs/router" { interface RouteInfo { breadcrumb?: string } }` checks declared keys at route definitions and types them on reads, while undeclared keys stay freeform.
