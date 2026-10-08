---
"@solidjs/router": patch
---

New link preload strategies for `createRouter({ preloadLinks })`, combinable with `intentPreload()` in an array:

- `tapPreload({ data = true })` preloads a link on `pointerdown`, ahead of its click.
- `viewportPreload({ all, data = false, delay = 100, rootMargin })` preloads a link once it has stayed in the viewport for `delay` ms, when the browser is next idle. Each link preloads once, and again after its `href` changes; links that leave before then are dropped. One `IntersectionObserver` is shared by every link.
- `eagerPreload({ all, data = false })` preloads links once the page has loaded and the browser is idle, including links mounted later.

The viewport and eager strategies apply to links marked `preload="viewport"` or `preload="eager"`, or with `{ all: true }` to every router link except `preload="false"` ones. They preload route code only unless created with `data: true`, and skip preloading when the browser reports Save-Data or a 2g connection.
