---
"@solidjs/router": patch
---

Parse search parameters such as `constructor`, `toString` and `__proto__` as ordinary keys. Single values remain strings, repeated values keep URL order, and all parsed keys are included in enumeration and serialization.
