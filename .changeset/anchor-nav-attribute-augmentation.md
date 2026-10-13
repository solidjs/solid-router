---
"@solidjs/router": patch
---

Put `state`, `noscroll`, `replace`, and `preload` back on `JSX.AnchorHTMLAttributes` by augmenting `@solidjs/web/jsx-runtime`. `preload` also accepts `"viewport"` and `"eager"`. `link` stays owned by core. Pairs with the core change that removes those four props from the anchor type.
