---
"@solidjs/router": patch
---

Fix a batch of long-standing bugs:

- `useSubmission().retry` was always a no-op due to an operator-precedence bug (#504)
- disposing an older owner no longer unregisters a newer action bound to the same URL, which caused forms to fall through to native submission after revalidation (#542)
- `useBeforeLeave` listeners now observe `defaultPrevented` set by other listeners (#530)
- `<A>` active state now ignores trailing slashes on `href` (#532)
- `useCurrentMatches` returns a copy so user mutation can't corrupt router state (#516)
- static path segments no longer percent-encode RFC 3986 pchar characters (`+`, `@`, `:`, `$`, `&`, `,`, `;`, `=`), so routes like `+foo` or `@user` match the browser's raw pathname (#559, #509)
- consecutive synchronous `setSearchParams` calls now compose: the merge applies to the in-flight navigation target instead of the stale committed location (#547)
