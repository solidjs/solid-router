---
"@solidjs/router": patch
---

Route params are decoded (#670). `useParams()`, `props.params` and `Router.match()` return each dynamic segment decoded after matching, so `/item/%E7%8C%AB` gives `id: "猫"` and `paths.item("猫")` round-trips. `matchFilters` see the decoded value, so `{ k: ["猫"] }` now matches. An encoded slash stays inside its param (`/a%2Fb/view` gives `name: "a/b"` for `/:name/view`), splat params are decoded segment by segment, and a malformed escape is left raw. `match.path` and `location.pathname` keep the URL's encoding.

Breaking: code that already calls `decodeURIComponent` on params decodes twice; drop the extra decode. Encode a param (or use `paths`) when interpolating it into a URL by hand.
