---
"@solidjs/router": patch
---

Stamp history depth from the current entry instead of `history.length`, so `useBeforeLeave` and scroll restoration keep working on Back once the browser's session history is full (#694)
