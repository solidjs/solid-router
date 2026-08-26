---
"@solidjs/router": patch
---

Update to solid-js 2.0.0-rc.3 and raise the peer floor to `^2.0.0-rc.3`. rc.3 deprecates reactive writes during SSR (`[SERVER_WRITE]`), and the router's one server-side signal write — the lazy-subtree version bump — now keeps its count in plain module state on the server (the client still mirrors it into a signal for subscription), so server renders stay warning-free and ready for when the deprecation becomes an error.
