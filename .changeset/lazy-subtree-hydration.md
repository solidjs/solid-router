---
"@solidjs/router": patch
---

Fix hydration when the initial route is a lazy route subtree. The client's reader for an unresolved route table took a hydration id the server never allocates, and the route contexts drew their ids at a point that depended on whether rendering first parked on the table, which the server's render does and the client's may not. Both misaligned the ids of everything after them ("Hydration key miss"). The reader no longer takes an id, and route contexts are created under their own owner. Hydration ids under the router's routes shift by one, the same on server and client.
