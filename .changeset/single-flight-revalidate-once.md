---
"@solidjs/router": patch
---

Fix duplicate revalidation after single-flight mutations. The transport consumer applies `X-Revalidate` metadata and seeds the query cache before the action resolves; the action layer then treated the unwrapped value as a fresh plain result and invalidated the newly seeded cache again, intermittently issuing a follow-up query fetch. An action now tracks whether the flight-data consumer actually ran during its mutation and skips the redundant default pass only in that case — server responses without flight data (no referrer, empty collection pass, no server-side collector) still get the default revalidation.
