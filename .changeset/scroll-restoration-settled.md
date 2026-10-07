---
"@solidjs/router": patch
---

Scroll restoration restores when the back/forward traversal's transition settles (`onSettled`) instead of watching `isRouting`. It behaves the same for users; the one timing change is that on a traversal between entries with the same URL the restore now runs just after `useIsRouting` render effects instead of just before (same task, before paint).
