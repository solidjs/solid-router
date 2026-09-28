---
"@solidjs/router": patch
---

A router action's default revalidation now runs inside the action's transition, so the refetch and the release of the caller's optimistic writes commit as one frame. The response used to be applied after the inner Solid action had settled: the optimistic overlay released when that action's transition committed while the refetch was still in flight, so the rows re-rendered against stale query data until it landed — a torn frame when the server rejected the change, and a flash away from and back to the optimistic result when it committed the change (#619).
