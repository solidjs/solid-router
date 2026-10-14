---
"@solidjs/router": patch
---

Add `useInRouter`, which returns whether the calling component is rendered under a router. The other router primitives throw outside one, so components that also render there (an error fallback above the router, a shared link component) can check first instead of wrapping `useLocation()` in a `try`/`catch`. Like the other primitives, it throws when called with no reactive owner, such as from an event handler.
