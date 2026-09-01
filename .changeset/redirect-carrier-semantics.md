---
"@solidjs/router": patch
---

Navigate from the redirect carrier instead of sniffing Location. Server-function redirects now arrive as `X-Server-Function-Redirect: <status> <resolved-url>` (solidjs/solid#3102), so the soft/hard split is a real origin comparison — same-origin targets navigate softly with `replace: true` (the target takes the submission's place in history, matching HTTP's form-post semantics), anything else hard-navigates — never a guess from how the author spelled the target, which sent relative and absolute spellings down different navigation paths (solidjs/solid#3107). A locally-produced `redirect()` (a client-side action) still navigates from its real 3xx + Location; a `Location` on any other status is the author's data and never navigates.
