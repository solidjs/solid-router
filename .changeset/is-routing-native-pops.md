---
"@solidjs/router": patch
---

`useIsRouting` now reports native history traversals. Every write is a transition in Solid 2, so a popstate forks the router's source signal exactly like programmatic navigation — but `isRouting` was a manual flag only flipped by `navigate()`. It is now derived: the manual flag unioned with `isPending` over the location/matches read, so back/forward navigations (including lazy-subtree resolution the matcher parks on) report as routing. Scroll restoration keys on it to hold restores until in-flight traversals commit.
