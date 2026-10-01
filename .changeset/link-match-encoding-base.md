---
"@solidjs/router": patch
---

Fix two link-state matching bugs shared by claimed anchors and `useLinkState`:

- Non-ASCII links now match. Both sides compare in the percent-encoded form `location.pathname` uses, so `<a href="/café">` is active and current on `/café`, whether the link spells the path raw or encoded. Encoded reserved characters such as `%2F` are never decoded, so they don't match a different path. A stray `%` in the location (`/100%`) no longer throws a `URIError` that halted the app's reactivity.
- Under a router `base`, the base root link (`/app`, `/app/`, or `useLinkState("/")`) is exact-only like `/` is without a base. Before, it was active on every page under the base.
