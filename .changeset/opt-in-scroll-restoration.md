---
"@solidjs/router": patch
---

Add opt-in explicit scroll restoration for back/forward navigation: `<Router scrollRestoration>` (#577). The browser's native same-document heuristic loses the saved offset when the destination route forces a layout while the document is still short — any component that measures itself on mount is enough to trigger it. When enabled the router sets `history.scrollRestoration = "manual"`, captures positions continuously keyed by the history entry depth it already tracks, persists them across reloads, and restores after the navigation settles — retrying as the document grows if the target offset isn't reachable yet, cancelled by the first user scroll. Off by default on 0.x; no behavior changes unless enabled.
