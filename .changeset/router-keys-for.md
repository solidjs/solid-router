---
"@solidjs/router": patch
---

`Router.keysFor(url)`: the query keys of the server component routes a URL shows, root to leaf — the app's `query` key for a hand-written route, the file for a file-system route. Pure matching over the instance's tree, so a server action can narrow `reload`/`respond`/`redirect`'s `revalidate` to what a mutation changed (`reload({ revalidate: Router.keysFor(paths.stories(id)) })`) without spelling a key; a `paths` node is accepted.
