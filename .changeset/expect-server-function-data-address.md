---
"@solidjs/router": patch
---

Track the server-function data address (solidjs/solid#3094). Scripted calls now go to `<endpoint>/data/<id>` while rendered action urls stay at the bare `<endpoint>/<id>`; the router needed no functional change — synthesized form actions already hand the rendered url to `createServerReference`, and the transport re-addresses its own calls — so this updates the wire-shape expectations in tests and the synthesis doc comment. Requires `@solidjs/web` 2.0.0-rc.5 (the release carrying the data-address split); the peer floor is raised to `^2.0.0-rc.5`.
