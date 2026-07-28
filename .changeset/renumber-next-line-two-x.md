---
"@solidjs/router": major
---

Renumber the Solid 2 prerelease line from `1.0.0-next.*` to `2.0.0-next.*`. The 0.16 line has been declared stable as `1.0.0`, so the 1.x majors now belong to the Solid 1 router; this line continues unchanged under 2.x, matching Solid 2's major. No code changes — `2.0.0-next.12` is the successor to `1.0.0-next.11`. If you track the `next` tag with a `^1.0.0-next.*` range, update it to `2.0.0-next.*` or a stable `1.x` will eventually satisfy it and hand you the Solid 1 router.
