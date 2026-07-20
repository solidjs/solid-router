---
"@solidjs/router": patch
---

Update to Solid 2.0.0-beta.21, the release that bridges the single-flight core protocol (`subscribeFlightData`/`collectFlightData` and `getServerFunctionMetadata`) through `@solidjs/web/server-functions`. Peer dependency floor raised to `2.0.0-beta.21` since the router's single-flight and GET-detection paths depend on that bridge.
