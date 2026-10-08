---
"@solidjs/router": patch
---

Server-rendered reloads keep their scroll position: the browser's native restoration handles them again instead of the router's. The router used to set `history.scrollRestoration = "manual"` for good and restore a reload itself at the first client flush, which on a streamed page lands while a `<Loading>` fallback is still showing — the offset clamps to the short document and is lost. The mode is per history entry and persists across reloads, so no browser restored such a page natively either.

Scroll restoration now hands the current entry back to the browser (`auto`) on `pagehide` and takes it again (`manual`) on a bfcache `pageshow`. A router created while hydrating, on an entry it handed back, neither scrolls nor switches to `manual` during the load: the browser restores once the streamed document has loaded, and the router takes `manual` a task after `load` (a programmatic scroll during the load cancels the native restore in Firefox and WebKit, and WebKit restores just after the load event, so an earlier `manual` write suppresses it) or before its first client navigation's history write, whichever comes first. Handed-back depths are kept next to the saved positions in sessionStorage, because after a reload Firefox reports the mode from before `pagehide`.

Client-rendered apps, entries the router pushed and never handed back, and back/forward traversals within the document restore from the router as before. The owned initial-restore `onSettled` is still registered on both server and client (a no-op on a deferred arrival), so hydration ids are unchanged.
