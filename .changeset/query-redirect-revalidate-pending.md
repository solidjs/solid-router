---
"@solidjs/router": patch
---

Honor `X-Revalidate` on redirects thrown from queries. `redirect(to, { revalidate })` only applied its keys through the action path; from a query it navigated and silently dropped them, so the canonical 401 flow — redirect to login and revalidate the session — left the session query serving stale authenticated data. Keys now invalidate before the navigation (the destination's preloads see the miss) and the live-signal sweep runs in the same transition as the navigation, matching the action path — surviving consumers refetch and hold the commit, so the redirect lands with fresh data instead of painting stale and updating after.

A redirecting query also no longer resolves `undefined` to its consumers. The read now stays pending on the client until the navigation unmounts it — resolving a missing value raced the transition commit, and anything deriving from the query (`data().map(...)`) could crash on `undefined` when the resolution won. Server rendering keeps resolving as before, since its render can't wait out a navigation and the 302 discards the body.
