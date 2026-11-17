---
"@solidjs/router": patch
---

Render a no-JS form post's outcome inline (#724). The page a no-JS submission redirects back to decodes the flash cookie asynchronously; that read suspended under the app's `<Loading>`, so the shell flushed the fallback and the form and its error arrived only as a streamed `<template>` a browser without JavaScript never swaps in. The router now reads submissions at its root on the server, so the decode holds the shell instead. No client bundle change.
