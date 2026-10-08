---
"@solidjs/router": patch
---

Link clicks and native form submits are attributed to the user's interaction in Solid's dev and observe builds (#643). The router's `document` click and submit listeners now run through `dispatchAsInteraction` from `@solidjs/web` (2.0.0-rc.14), joining the interaction frame the runtime opens for that event. An anchor click's `NavigationEvent.interaction` is the click, and the click is one interaction record carrying both component `onClick` work and the navigation. An action submitted through a `<form>` runs under the `submit` interaction, so its writes and holds are attributed to it. Only clicks the router acts on join a frame, and preload listeners stay outside one. Production builds are unchanged: `dispatchAsInteraction` is the plain call there.
