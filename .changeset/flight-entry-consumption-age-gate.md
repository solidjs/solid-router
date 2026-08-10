---
"@solidjs/router": patch
---

Bound hydration flight-entry adoption by the cache's own retention tolerance. `query()`'s keyed consumption path (`sharedConfig.has/load`) deliberately stays open past hydration `done` — a boundary inside a deferred claim scope (a lazy route module) can make its first call late and must adopt the promise the server DOM was rendered from — but adoption also stamps the seeded entry fresh (`cached[0] = now`, the burst-dedup window that lets preload + render share one consumption), so an entry first consumed long after load presented a minutes-old server value as fetched-now, masking its real age from the staleness logic entirely. Consumption is now gated on the flight payload being younger than `CACHE_TIMEOUT` (180s, the same bar the sweep applies to entries the router fetched itself): within the window behavior is unchanged, past it a first-ever call refetches instead of adopting.
