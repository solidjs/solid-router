---
"@solidjs/router": minor
---

Forms submitted through delegation are marked `aria-busy="true"` while their action is in flight — the form half of the attribute vocabulary links get (`data-active`/`data-pending`). The attribute covers the mutation and its response handling (revalidation included), survives overlapping submissions of the same form via a counter, and always clears, error or not. Programmatic `useAction` calls have no form and set nothing. Style with CSS:

```css
form[aria-busy] button { pointer-events: none; opacity: 0.6; }
```
