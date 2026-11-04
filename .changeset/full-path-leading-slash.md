---
"@solidjs/router": patch
---

Under a `base`, a path that starts with `/` is now a full path everywhere, and the router never adds the base to it. This covers `navigate()`, `useLinkState`, `useResolvedPath`, and query and server-function redirects, and matches what `<a href>` and a raw HTTP redirect already did. `redirect()` comes from `@solidjs/web`, which doesn't know the router's base, so `redirect(paths.login)` used to land on `/app/app/login`. It now lands on `/app/login`.

Migration: under `base: "/app"`, `navigate("/about")` now goes to `/about`. Use `paths.about` or `` `${base}/about` ``. The same applies to `useLinkState(() => "/about")`, `useResolvedPath(() => "/about")` and `redirect("/login")`. A redirect to a full path outside the base navigates the document. A `navigate()` to one navigates softly, as before.
