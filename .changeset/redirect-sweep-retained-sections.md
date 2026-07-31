---
"@solidjs/router": patch
---

A redirect's revalidation sweep only refires queries under route sections the navigation retains. Invalidation is still universal — every entry matching the revalidate keys (or everything, absent explicit keys) is a miss for all future use, including hover preloads, forward navigations, and history traversals. But a section the redirect is leaving no longer fetches eagerly: its render is disposed at commit and never paints, so the fetch (visible as a second request on what single flight promises is one) is deferred to the entry's next real use — a later navigation's preload or read, unless the flight payload seeds it first. Retained sections and consumers outside any route section still refetch inside the navigation's transition, so the redirect commits atomically with fresh data; seeded entries (including still-streaming promises) are fresh and serve without refetching. A plain revalidation with no navigation sweeps everything, as before.
