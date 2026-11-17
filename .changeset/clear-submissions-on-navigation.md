---
"@solidjs/router": patch
---

Clear settled submissions on navigation again, as 1.x did. The 2.0 rewrite dropped the clear along with pending submissions, so a page's errors and results outlived unmounting and reappeared when you came back. Every client location write (navigate, redirect hop, back/forward) now clears them, committing with that navigation, so the old page keeps showing them while the navigation is pending. An action that navigates still shows its own outcome on the page it lands on.
