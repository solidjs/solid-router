---
"@solidjs/router": patch
---

Single flight is now the router's, not the action layer's: a mounted router subscribes to the server function transport at mount (unless `singleFlight={false}`), so a server function called straight from an event handler gets its `X-Revalidate` keys, redirect and flight data applied without an action. Query reads, the flight consumer and actions now share one redirect/revalidation path, so action redirects resolve against the router base the same way query redirects do.
