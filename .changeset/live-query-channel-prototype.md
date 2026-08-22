---
"@solidjs/router": minor
---

`liveQuery()` — keyed live queries over value-shaped streams (prototype)

Declares a keyed live query: an async-iterable producer whose yields are
successive values of one logical query, re-yielding current state on every
invocation. liveQuery IS the live declaration — no separate wrapper needed:
server functions are declared GET at creation (like `query`), the server
face brands the resolved iterable so SSR live policy applies (document face
renders the first value, hydration adopts it and reconnects), and the
client channel owns reconnect-with-backoff when a connected stream dies.

One connection per (name + args) key is shared by every consumer: late
subscribers receive the latest value immediately, delivery is latest-wins,
and the connection closes when the last consumer leaves (microtask linger
so a re-running memo doesn't thrash it). Connections are lazy — calling the
function returns a live-branded iterable; the first pull connects — so
hydration traces open nothing. Retry is for transient deaths only: a
definite rejection (4xx — the transport stamps HTTP statuses onto
failures) ends the channel and surfaces the error to consumers, like a
first-connect failure does. On the server, channels are request-scoped:
every consumer of a key within one render observes the same first value
(the record is retained past teardown for replay), and separate requests
never share connections.

Live queries participate in both router data protocols. Explicit
`revalidate(key)` reconnects (the producer re-yields current state on
invocation). Single-flight participation is delivery-side: a mutation's
flight payload pushes straight into open channels — the mutation response
is the round trip — while the post-mutation sweep leaves the healthy
connection in place, since the live stream is itself the freshness
mechanism. New `registerRevalidateHook`/`registerFlightDataHook` seams in
query let keyed stores join those protocols without coupling.

The callable carries the `query` conventions (`key`, `keyFor`) plus a
reactive `status(...args)` read ("idle" | "connecting" | "connected" |
"reconnecting" | "closed").
