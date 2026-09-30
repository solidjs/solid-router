---
"@solidjs/router": patch
---

Keep `location.query` data stable when navigation changes only the pathname or hash. Consumers that enumerate the query no longer rerun when the search string is unchanged, and repeated parameters keep the same array references.
