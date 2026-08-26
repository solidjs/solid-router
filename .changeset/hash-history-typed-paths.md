---
"@solidjs/router": patch
---

Fix navigation and redirects with typed paths under hashHistory (#582). Paths nodes now carry their logical path under the global `Href` brand (`Symbol.for("solid.Href")`): `navigate()` routes the logical path directly instead of coercing the node to its display href, and `redirect(paths()...)` no longer throws `@solidjs/web`'s Href guard. Display-form strings (terminated paths calls, redirect Location headers) starting with `#` are mapped back through the history integration's parser, the same way anchor clicks are. Plain string arguments remain logical paths and are never parsed.
