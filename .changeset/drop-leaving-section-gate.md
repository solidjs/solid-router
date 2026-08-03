---
"@solidjs/router": patch
---

Drop the router-side leaving-section gate; require solid 2.0.0-beta.30

Solid's scheduler now cancels recomputes that a parking transition's own
writes queued on nodes the same navigation orphans, so a redirect's
revalidation sweep no longer re-runs query memos in outgoing route sections
at all — the phantom second request on single-flight mutations is prevented
in core. The `RouteContext.retained`/`RouterContext.leaving` internals and
the read-time gate in `query` that worked around it are removed.
