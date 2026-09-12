---
"@solidjs/router": patch
---

A `navigate()` issued while the previous navigation has landed but not yet reached history — a guard redirecting from render as the held route lands — is now a redirect hop of that navigation rather than a new one. The integration tracks the write between its location commit and its history commit (`RouterIntegration.inflight`), and hop depth counts it alongside `isPending(source)`. Observe builds declare one navigation with a `redirects` entry for the abandoned destination, timed from the click; `replace`/`scroll` inherit from the original navigation as they do for a pending hop.
