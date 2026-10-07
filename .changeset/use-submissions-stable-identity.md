---
"@solidjs/router": patch
---

`useSubmissions` keeps the same list while its submissions are unchanged. The filter used to return a new array on every run, so another action's submission settling re-ran every reader of this action's list (and tripped the dev `UNSTABLE_MEMO_OUTPUT` warning).
