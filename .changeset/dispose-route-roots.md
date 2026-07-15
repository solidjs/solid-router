---
"@solidjs/router": patch
---

fix #451 - dispose per-route roots when the route tree unmounts; leaked roots stayed subscribed to route matches and crashed with `TypeError: ... (evaluating 'match().path')` on a later navigation (e.g. when a `<Show>` in the root component hid the outlet during login/logout flows)
