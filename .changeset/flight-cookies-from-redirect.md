---
"@solidjs/router": patch
---

Apply cookies set on a returned/thrown redirect response during single-flight collection. `Set-Cookie` headers attached to the redirect itself (`redirect(to, { headers })`) never reach the request event's response, so the flight-data preload pass ran with the pre-mutation cookie state — a login mutation that sets its session cookie on the redirect collected the destination's data as logged-out. They now fold into the collection pass's `Cookie` header after the event's own mutations, winning on conflict, mirroring the browser round trip they replace. (Ports solid-start#2243.)

Also hardens the no-JS form handler: an unparseable `Referer` falls back to the app root instead of producing an invalid `Location`, and the body-less redirect it builds no longer advertises the dropped body's `Content-Type`/`Content-Length`. (Ports solid-start#2245; the value-flashing part of that fix was already covered here since the core handler unwraps response envelopes before the hook.)
