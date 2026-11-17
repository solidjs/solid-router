---
"@solidjs/router": patch
---

Fix `query()` re-running subscribers when it adopts a preload cache entry: stamp the entry's version once at adoption instead of on every navigate read (#739).
