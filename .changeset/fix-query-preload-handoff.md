---
"@solidjs/router": patch
---

Fix query() re-notifying consumers that read a preloaded entry during a navigation: the preload-to-read handoff now bumps the entry stamp and updates the entry's version signal once, before the reading scope tracks it, instead of re-bumping and re-writing a fresh stamp on every read (which made consuming memos re-run per flush pass and re-adopt the still-pending preload promise, surfacing as ABANDONED_FLIGHTS in dev attribution).
