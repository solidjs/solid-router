---
"@solidjs/router": patch
---

`browserHistory()` no longer throws when `history.state` is still null after `replaceState` (seen in iOS WKWebView embeds)
