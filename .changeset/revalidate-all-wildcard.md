---
"@solidjs/router": patch
---

Honor the reserved `X-Revalidate: *` declaration (`revalidate: "*"`, `REVALIDATE_ALL` in `@solidjs/web`) as "every entry" — the same scope this router already gives an action that declares nothing, so an author who spells "all" explicitly lands on the default path rather than on a literal `*` prefix that matches no key. Applies to the flight consumer, the action metadata path, and a redirect thrown from a `query` read; the empty declaration (`revalidate: []`) still narrows to nothing.

Pairs with solidjs/solid#3502, which reserves the key at the response helpers and delivers response metadata to flight consumers whether or not data was folded.
