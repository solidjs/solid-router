---
"@solidjs/router": patch
---

Delegate form submissions for server-rendered action urls without client-side registration. A form bound directly to a server action in a server component ships no client JS of its own — its `action="/_server?id=...&args=..."` url is self-describing, so the router now synthesizes the invocation from the url instead of falling back to a native (no-JS) post:

- `handleFormAction` on a registry miss for a url under `actionBase` creates a generic action from the url's `?id` (bound `.with()` arguments stay in `?args`, which the server reads for natural-encoding bodies exactly as it does for no-JS posts) and posts the form data to it verbatim through the server-function transport. Submissions, `aria-busy`, redirects, revalidation, and single-flight data all flow through the normal action pipeline, so invalidation falls through the client router as usual. The synthesized action registers under the url, so repeat submits reuse it and a real registration takes precedence.
- Delegation now intercepts POSTs to `actionBase` urls even when no action module is in the client graph at all, loading the handler lazily on first submit (a new `serverForms` split point in the `solid` condition's per-module graph — router-only bundles stay lean, the initial-chunk cost is ~0.4 KB gzip for the synchronous intercept). No-JS submission remains the fallback only for clients with no JS. The no-build flat bundle inlines the import instead of splitting.

Client-only actions (`https://action/...`) still require their module — they are user JS by definition.
