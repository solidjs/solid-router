---
"@solidjs/router": patch
---

Link preloading and click handling resolve an anchor's `href` against `document.baseURI`. An anchor cloned from a `<template>` keeps its raw `href` (e.g. `/about`) until it is adopted into the page, so `eagerPreload`'s idle flush threw `Invalid URL` when it reached one that a transition still held off the page (#704).
