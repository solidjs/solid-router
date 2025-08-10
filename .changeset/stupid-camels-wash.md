---
"@solidjs/router": patch
---

Fix Router popstate event handling logic

- Simplified delta check logic for history navigation
- Improved reliability of forward navigation detection
- Fixed window.history.forward() navigation handling