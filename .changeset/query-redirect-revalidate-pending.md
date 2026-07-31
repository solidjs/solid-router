---
"@solidjs/router": patch
---

Honor `X-Revalidate` on redirects thrown from queries. `redirect(to, { revalidate })` only applied its keys through the action path; from a query it navigated and silently dropped them, so the canonical 401 flow — redirect to login and revalidate the session — left the session query serving stale authenticated data. Keys now invalidate before the navigation (the destination's preloads see the miss) and the live-signal sweep runs once the transition settles, sharing the action path's defer so an outgoing route's queries unmount instead of refiring.

A redirecting query also no longer resolves `undefined` to its consumers. The read now stays pending on the client until the navigation unmounts it — resolving a missing value raced the transition commit, and anything deriving from the query (`data().map(...)`) could crash on `undefined` when the resolution won. Server rendering keeps resolving as before, since its render can't wait out a navigation and the 302 discards the body.
