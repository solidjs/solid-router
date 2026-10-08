---
"@solidjs/router": patch
---

Link claims read pending state in isolation. A claim fires synchronously wherever its anchor is created — a component body, a memo's pass, or a server-component boundary being adopted — and with the `pendingLinks` plugin its refresh reads `isPending`/`latest`. A verdict read marks the computation running it as a verdict reader, which Solid re-derives whenever one of its dependencies goes pending, so the claim leaked that mark onto its host: a `dynamicComponent` mounting a server component that contains links re-ran its render (re-mounting the component and losing its client state) on every query revalidation after an action. The claim now reads link state with no running computation. Pending state that isn't ready yet (an initial load into an unresolved lazy route) reads as not pending instead of holding the host; the claims sweep refreshes the anchor once it settles.
