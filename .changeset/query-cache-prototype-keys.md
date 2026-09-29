---
"@solidjs/router": patch
---

Include own `__proto__` properties when generating query cache keys. Arguments that differ in those values now use separate cache entries instead of returning another argument's cached result.
