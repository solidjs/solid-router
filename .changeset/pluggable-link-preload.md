---
"@solidjs/router": patch
---

Link preloading is now pluggable and opt-in. **Breaking:** the router no longer preloads on hover, focus, or touch by default; pass a strategy to restore it:

```ts
import { createRouter, intentPreload } from "@solidjs/router";

const Router = createRouter({ routes, preloadLinks: intentPreload() });
```

- `preloadLinks` takes a strategy or an array of strategies instead of a boolean. A boolean is a type error, warns in development, and preloads nothing.
- `intentPreload({ delay = 20, data = true })` is the previous behavior: preload when the pointer rests on a link for `delay` ms, on focus, and on touchstart. `data: false` warms route code only.
- `preload="false"` on a link now opts it out of preloading entirely. Previously it still preloaded the route's code and skipped only its data.
- `transformUrl` now applies inside route preloading itself, so preloads match the same pathname navigation does, including `usePreloadRoute` calls, which previously matched the untransformed URL.

Apps that don't preload links no longer ship the hover/focus/touch listeners.
