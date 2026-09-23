---
"@solidjs/router": patch
---

`liveQuery` now participates in single-flight collection. The client half already existed — a mutation's flight payload pushed values into open channels — but the router's collector never produced a live key: `liveQuery` had no data-only branch, so after a mutation a live query's freshness depended entirely on its producer noticing the change, and even an `X-Revalidate` naming the key did nothing (the sweep leaves live channels alone by design). In the collector's data-only render, `liveQuery` now applies the same key filter `query` does and collects the producer's first yield — current state, by the liveQuery contract — closing the iterator there, exactly as solid's server memo takes a live source's first value for the document. A producer suspended at its first `yield` runs its `finally` and never reaches its watch, so the cost is one read, and the mutation response is the round trip.
