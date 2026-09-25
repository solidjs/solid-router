---
"@solidjs/router": patch
---

Optimistic writes made around a router action now revert when the action resolves without changing the data (returning an `Error`, a value, or nothing). The action's default revalidation used to run after its inner Solid action had finished, outside the transition, so a refetch that returned the same data never released the caller's optimistic overlay. The response is now applied inside the transition (#620).
