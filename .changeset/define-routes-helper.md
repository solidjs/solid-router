---
"@solidjs/router": minor
---

Add `defineRoutes`, an identity helper with a `const` type parameter that
preserves route literal types for extracted route trees. Inline arrays passed
to `createRouter` already infer literally; `defineRoutes` removes the need
for `as const` on the common pattern of exporting the tree as a separate
value — and makes the silent type degradation of forgetting it impossible.
