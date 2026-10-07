---
"@solidjs/router": patch
---

Pending navigation state is now pay-for-use, so an app that renders no pending UI no longer bundles Solid's `isPending`/`latest` machinery.

- **`data-pending` needs `links: pendingLinks`.** Claimed anchors only get `data-pending` when the router is created with `createRouter({ routes, links: pendingLinks })`. `aria-current` and `data-active` are unchanged.
- **`RouterContext` no longer exposes `isRouting` or `pendingTarget`.** Use `useIsRouting()`, and read the in-flight destination with `isPending(() => location.pathname) ? latest(() => location.pathname) : undefined` on `useLocation()`.
- `useIsRouting()` and `useLinkState().pending` behave as before.
