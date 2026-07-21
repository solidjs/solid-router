---
"@solidjs/router": minor
---

Lazy route subtrees: `children` accepts a thunk (`children: () => import("./feature/routes")`) so a section's route table loads on demand while staying part of the one typed tree. Types flow through the import's promise type into `paths` and the typed hooks; hover-intent preloading kicks the table load and cascades into inner route preloads when it lands; navigation into an unresolved subtree folds the load into the transition (old screen holds); SSR and the single-flight collector resolve matched boundaries server-side. Resolution is cached per thunk and append-only. Async boundaries require the streaming render entry points (`renderToStream`/`renderToStringAsync`); the module's `default` or `routes` export (or a direct array) is used.
