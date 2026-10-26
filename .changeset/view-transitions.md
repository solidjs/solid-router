---
"@solidjs/router": minor
---

Opt-in view transitions for client navigations (`createRouter({ viewTransition: true })`, `navigate(to, { viewTransition })`, or a `viewtransition` / `noviewtransition` attribute on an anchor). The browser snapshots the current page, then the revealing flush — the new route, the history write, and scroll restoration — runs inside `document.startViewTransition`, and the update callback stays open until that navigation settles. Same-tick navigations share one transition. Browsers without the API, and `prefers-reduced-motion: reduce`, navigate without a snapshot. Off by default.
