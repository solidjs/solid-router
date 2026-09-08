---
"@solidjs/router": patch
---

Accept an explicit `undefined` on every optional `RouteDefinition` property (and on the optional properties of `defineRoute`, `defineFileRoute`, and their returned config types), so route trees produced under `exactOptionalPropertyTypes` — notably `fileRoutes()` applied to `filesystem-routing`'s generated manifest types, whose leaves carry `children: undefined` — type-check. The runtime already treated absent and `undefined` alike; the one presence check (`hasOwnProperty("path")`) now treats an explicit `path: undefined` as a pathless route too (#598).
