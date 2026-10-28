---
"@solidjs/router": patch
---

Stamp a pushed history entry's `_depth` as one above the current entry instead of `history.length - 1`. Browsers cap session history (50 entries in Chromium and Firefox), so once the cap was reached every new entry got the same depth. That broke scroll restoration and `useBeforeLeave` back-navigation deltas on long sessions. Entries the router did not push, such as a `#anchor` jump, are stamped one above the last known depth as well.
