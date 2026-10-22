---
"@solidjs/router": patch
---

Dev builds name the data layer's primitives after their keys (`query:<key>`, `liveQuery.status:<key>`) and the router's location, url and submissions nodes (`router.*`), so attribution diagnostics say which query is waiting instead of `"signal"`. The names sit behind `DEV &&` and fold out of production bundles.
