---
"@solidjs/router": patch
---

Move off `sharedConfig` onto Solid's public hydration APIs: `query()` writes server results with `getHydrationWriter()` (gated by `isHydratable()`, so `<NoHydration>` suppresses it) and adopts them on the client with `takeHydrationValue()`. Drops the obsolete `sharedConfig.done` write on the first location change. Requires solid-js / @solidjs/web 2.0.0-rc.13; peer range now `^2.0.0-rc.13`.
