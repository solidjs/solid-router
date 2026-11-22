---
"@solidjs/router": patch
---

Fix hash-history link state to match the logical route in claimed anchor hrefs and `useLinkState` display strings. Preserve route-relative fragment inputs to the hook, including during server rendering.
