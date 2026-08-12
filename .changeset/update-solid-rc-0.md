---
"@solidjs/router": patch
---

Update `solid-js` / `@solidjs/web` to `2.0.0-rc.0` and move the peer ranges from `>=2.0.0-beta.33 <2.0.0-experimental.0` to `^2.0.0-rc.0`. The old experimental-capped upper bound excluded the rc line entirely (`experimental` sorts before `rc` in prerelease ordering), so the published manifest could not admit 2.0.0-rc.0; the caret keeps flooring above the hazardous 2.0.0-experimental.* publishes and auto-graduates to stable 2.x.
