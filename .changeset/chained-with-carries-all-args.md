---
"@solidjs/router": patch
---

A chained `.with()` (`action.with(a).with(b)`) now puts every bound argument in its url (`?args=[a,b]`). Previously the url carried only the last call's arguments, so a server-rendered or no-JavaScript submission ran with arguments missing, and two chains ending in the same argument shared one url and overwrote each other's client registration.
