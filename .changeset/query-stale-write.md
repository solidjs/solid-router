---
"@solidjs/router": patch
---

`query.get` no longer returns a value from a fetch that was superseded. When an older fetch for a key settles after `revalidate()` started a newer one, or after `query.set` wrote a value, its result is no longer written over the newer value.
