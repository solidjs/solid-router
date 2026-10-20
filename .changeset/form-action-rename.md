---
"@solidjs/router": patch
---

Rename the router's `action` to `formAction` (and the `Action` type to `FormAction`): it is the form layer — submissions, `aria-busy`, no-JS posts, `.with()` — while `action` is solid-js's own primitive. `action` and `Action` stay as deprecated aliases with a dev warning until the next major. `useAction` is deprecated with no replacement: call the server function (or a core `action`) directly, since the router now applies revalidation and redirects on any server function call.
