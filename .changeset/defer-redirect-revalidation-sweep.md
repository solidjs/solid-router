---
"@solidjs/router": patch
---

Defer the revalidation sweep of a redirecting mutation until the navigation transition settles. Invalidation and single-flight cache seeding stay immediate, but the live-signal sweep no longer runs while the outgoing route is still mounted — previously a mutation fired from a route whose own query the flight payload didn't cover (e.g. an editor page) would refire that query mid-transition and throw the result away, adding a second round trip to every single-flight mutation with a redirect.
