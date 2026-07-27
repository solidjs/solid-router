---
"@solidjs/router": patch
---

Fire `onSettled` on every action completion (#580). Void mutations, metadata-only responses, and redirects previously skipped the settled hooks entirely, so state set up in `onSubmit` (a pending dialog, for example) never cleared for actions that return nothing. Every invocation now settles its hooks exactly once. The submissions book-keeping is unchanged and intentional: only outcomes with a result or an error enter the list, so the typical void mutation still leaves nothing behind.
