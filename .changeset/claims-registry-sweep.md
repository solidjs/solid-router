---
"@solidjs/router": patch
---

Rework link-claim state to a single render effect that sweeps a registry of claimed anchors, replacing the per-anchor render effect. Behavior is unchanged — every anchor still depends on the same location sources, so nothing was gained from per-element granularity — but each claimed anchor now costs a registry entry and a cleanup hook instead of a full reactive node with dependency links, cutting per-anchor memory roughly 6x and making claim/unclaim on link-heavy pages cheaper.
