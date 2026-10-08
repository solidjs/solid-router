---
"@solidjs/router": patch
---

Require solid-js / @solidjs/web 2.0.0-rc.14. Two observable changes come from rc.14's hold model, where `isPending`/`latest` read the committed screen:

- A synchronous navigation (nothing to wait for) no longer reads as routing at all: `useIsRouting()`, `useLinkState().pending` and the `isPending`/`latest` recipe stay `false` through it, where rc.13 flipped them `true` and back within the navigation's own flush.
- When a navigation supersedes one still in flight, `data-pending` from `pendingLinks` moves to the new destination at once, agreeing with `useLinkState().pending`, instead of staying on the superseded link until its data resolved.
