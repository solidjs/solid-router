---
"@solidjs/router": minor
---

`liveQuery()` — a keyed channel layer over the `live()` transport (prototype)

Declares a keyed live query over a value-shaped stream. One connection per
(name + args) key is shared by every consumer: late subscribers receive the
latest value immediately, delivery is latest-wins, and the connection closes
when the last consumer leaves (microtask linger so a re-running memo doesn't
thrash it). Connection is lazy — calling the function returns a live-branded
iterable, the first pull connects — so SSR/hydration traces open nothing and
the signals layer's live policy (document face first-value, hydration
takeover) applies unchanged.

`revalidate(key)` now reaches live channels too: invalidating a live query
reconnects it (the source re-yields current state on invocation by
contract), through a new `registerRevalidateHook` seam in query. The
callable carries the `query` conventions (`key`, `keyFor`) plus a reactive
`status(...args)` read ("idle" | "connecting" | "connected" | "reconnecting"
| "closed"), stitched from the transport's `onstatus`. `liveQuery.set(key,
value)` pushes a local value to subscribers (the next server yield
supersedes); `liveQuery.reconnect(key?)` forces reconnection.

The producer should be a `live()`-declared server function — reconnect-on-
death and SSR policy live in that declaration; liveQuery dev-warns when
handed a server function without it rather than auto-wrapping (the client
reconnect loop must stay treeshakeable with the declaration).
