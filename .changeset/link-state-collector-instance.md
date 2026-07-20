---
"@solidjs/router": minor
---

Add `useLinkState` — reactive `active`/`current`/`pending` state for custom link components, the programmatic counterpart of the attribute vocabulary plain anchors will receive (`aria-current`, `data-active`, `data-pending`). `<A>` now derives its active/current state from it, so both share one semantics (trailing-slash and case handling, `end` for exact-only). Accepts typed paths nodes as well as strings.

`createFlightDataCollector` also accepts a `createRouter` instance directly: its routes, base, and `preload` are read off the instance config, so server wiring stays a one-liner (`createFlightDataCollector(Router)`).
