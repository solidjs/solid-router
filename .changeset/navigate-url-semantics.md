---
"@solidjs/router": patch
---

`navigate(string)` now resolves relative strings with URL semantics, the same way the browser resolves an `href` (#502). `navigate("../similar/333")` from `/show/home/fiction/333` lands on `/show/home/similar/333` instead of leaking literal `..` segments into the URL; bare strings resolve as siblings, and `?`- or `#`-only strings keep the current path. Leading-`/` paths are unchanged — they stay base-prefixed absolute paths. One behavioral note: `navigate("")` is now a same-document reference (keeps the search string) rather than a shortcut to the bare pathname.
