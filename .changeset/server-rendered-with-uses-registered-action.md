---
"@solidjs/router": patch
---

A form rendered with `action.with(...args)` on the server now submits through the registered action on the client, so its `onSubmit` and `onSettled` hooks run with the bound arguments and `useSubmissions(action)` sees the outcome. Previously the rendered `?args` url missed the registry and fell back to a generic invocation (server actions) or native submission (client actions).
