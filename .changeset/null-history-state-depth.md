---
"@solidjs/router": patch
---

Don't throw on import when `history.state` is still null after `replaceState` (seen in iOS WKWebView embeds)
