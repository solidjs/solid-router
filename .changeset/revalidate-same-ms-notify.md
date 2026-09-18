---
"@solidjs/router": patch
---

`revalidate()` now notifies live consumers of an entry fetched within the same millisecond. The cache's live version signal carries the entry's fetch stamp, and a signal write of an equal value is a no-op — so a sweep landing before the clock ticked past the fetch (a mount whose guard redirect resolves immediately, a redirect's `X-Revalidate` keys naming a query the surviving layout just read) left that consumer holding its stale value with no refetch. The sweep now always produces a change, so the surviving layout refetches inside the same transition as before.
