---
"@solidjs/router": patch
---

Settle router actions when their result is on screen (#649). A form's `aria-busy`, the `onSettled` hooks and the submission record now release at the commit of the action's transition, instead of when the action body returns, so a revalidation refetch or redirect that holds the transition no longer clears busy state, runs hooks or renders the submission while the old UI is still showing. A nested `yield call()` settles at the outer action's commit. The promise from `useAction` (and the action call) still resolves when the body finishes, so it can come before the settle. The hooks that run are the ones registered when the body finished, the same set as before: a hook owned by a component the commit unmounts (the page a redirect leaves) still runs for that submission.

Every exit path settles exactly once: a failure outside the mutation (a throwing `onSubmit` hook, a response that fails to decode) now releases the form and records the error on the submission, where it previously rejected the form submission unrecorded. A throwing `onSettled` hook is reported without stopping the hooks after it.

Busy state is keyed by the form's `action` URL rather than the element, so a form that a server-component morph strips, or that a re-render replaces mid-flight, gets `aria-busy` back when it is (re-)claimed. Like `aria-current`, the router only manages an `aria-busy` it set: an authored value is never overwritten or removed. A consequence of keying by URL: other forms posting to the same action URL show busy while it is in flight.
