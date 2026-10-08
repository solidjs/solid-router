---
"@solidjs/router": patch
---

Speed up `<A>` server rendering by roughly 5x

`<A>` spent most of its server render time in `mergeProps` and `splitProps`, which build
accessor-backed prop objects that can never be observed during a one shot
`renderToString`. The default `activeClass` / `inactiveClass` merge is gone, the
`location.pathname` normalization is shared instead of repeated per link, `JSON.stringify`
is skipped when there is no `state`, and on the server a link that passes nothing beyond
the props `<A>` consumes itself now skips `splitProps` and the JSX spread entirely.

Rendered output is unchanged on the client, and unchanged on the server apart from the
`link` marker serializing as `link` rather than `link="true"` on that fast path. Client
bundles get slightly smaller, since the server branch is constant folded away.
