---
"@solidjs/router": patch
---

Wait for hydration to finish before applying client navigation. Early link clicks no longer interrupt pending server-rendered content. Queued URL updates keep their order and are discarded if the router unmounts.
