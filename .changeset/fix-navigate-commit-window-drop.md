---
"@solidjs/router": patch
---

Fix soft navigations being silently dropped in the commit window. Signal reads only see flushed state, so a `navigate()` racing a pending target's unflushed write — or issued right after the commit microtask, before the source write flushed — deduped against a stale location and was lost, breaking last-call-wins. The dedupe now compares against the pending transition target when one exists, and remembers the just-committed target until the reactive read catches up.
