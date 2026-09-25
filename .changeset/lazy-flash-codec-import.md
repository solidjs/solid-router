---
"@solidjs/router": patch
---

Keep the runtime's server entry off the client module graph (#616). The flash decoder now reaches `@solidjs/web/server-functions/server` through a dynamic import inside the first decode instead of a static top-level import: production builds tree-shook the codec, but Vite dev doesn't shake, so every dev page loaded the server codec module (and `solid-js/internal` behind it — a second reactive-engine instance in linked workspaces). Installation stays synchronous, so the decoder is in place before the first request render (cold-start POST-redirect-GET included); the module load rides the decode promise the seeding read already parks on.
