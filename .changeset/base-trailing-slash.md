---
"@solidjs/router": patch
---

A `base` with a trailing slash, such as Vite's `import.meta.env.BASE_URL` (`"/app/"`), no longer produces double slashes. `Router.paths` hrefs and `navigate("/about")` now give `/app/about` instead of `/app//about`, which matched no route.
