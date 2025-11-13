---
"@solidjs/router": patch
---

Use `name` in `action` and `createAsync`

`action()` and `createAsync()` were not respecting user defined name.
Moreover, action was not applying the hashed name and only naming the action "mutate", I believe my changes brought it closer to original intentions, but I can revert them otherwise.
