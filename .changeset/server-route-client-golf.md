---
"@solidjs/router": patch
---

Smaller client footprint for the server route pieces: the fs adapter's code-split server-function check and the long direct-mount message of `serverRouteComponent` are development-only (`DEV &&`, folded out of shipped bundles), `useSearchParams` and the server route args share one Standard Schema validation helper, and the brand lookup and args equality are tightened. Behavior is unchanged; in production the fs adapter is ~380 bytes minified and the server route wrapper ~215.
