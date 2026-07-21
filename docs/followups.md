# 1.0 Follow-ups

Deferred work tracked across releases. These are intentional non-goals for the
1.0 release itself.

## Fold out the server-form delegation intercept via the Vite plugin

The delegation fallback for server-rendered action urls (see
`handleFormSubmit` in `src/data/events.ts`) is always on: it costs ~0.4 KB
gzip in the initial chunk (the synchronous intercept plus the entry exports
the lazy `serverForms` chunk pins) and is what makes forms in server
components work with zero client-side registration.

A pure SPA that never runs the `"use server"` transform provably has no
server-action urls to intercept — and the compiler/Vite plugin knows this
statically. When the router Vite plugin package exists, it should fold a
compile-time flag (same mechanism as `isServer`) when the app graph contains
no `"use server"` modules, letting the minifier drop the intercept branch and
the lazy chunk with it. Default library behavior stays always-on so nothing
needs wiring; the plugin only reclaims bytes it can prove are dead.

Cost of adopting: a define name shared between the plugin and the router —
mint it when the plugin lands, not speculatively.

## Claims for server-component-rendered elements

Element claims are emitted by the compiler in client template output and
re-fired by the runtime on attribute writes — which is exactly why they never
fire for elements that arrive through server-component rendering: that HTML
is materialized from the flight payload, not from compiled client templates.

What this means today:

- **Behavior works**: navigation, hover preload, and form submission in
  server components all ride document-level delegation, which doesn't care
  where an element came from.
- **Per-element state doesn't**: `aria-current` / `data-active` /
  `data-pending` on anchors (and `aria-busy` on forms) are applied by the
  claims consumer (`src/claims.ts`), so anchors rendered by server
  components don't get live link state.

Closing the gap needs a claim (or equivalent registration) fired when the
server-component renderer materializes a claimable element — a platform hook
in the flight/hydration runtime, not a router-side change; the router's
consumer already handles late claims correctly (late mounts via `<Show>`,
portals). Design belongs with dom-expressions' server-component work.

## Changeable route subtrees

Lazy subtrees (shipped — see README "Lazy Route Subtrees") cover code that
arrives later but is knowable at build time. The remaining axis is
*changeable*: a subtree whose presence depends on runtime state (auth,
flags). 0.x got this for free because trees were JSX, hence reactive — and
because 0.x promised nothing changeability could break: no typed paths, and
intent preloads were always best-effort against the current tree snapshot
with render-time preloads as the correctness backstop.

If this comes back for 1.0+ it comes back through a re-evaluating `children`
thunk — the controlled slot — never a live-editable tree:

- Typed paths already promise *spelling, not matching* — `matchFilters`
  means a well-typed URL can fail to match at runtime — so a
  conditionally-present subtree fits the existing contract as long as its
  shape is declared statically (types cover the superset, absence = no
  match).
- Preloads keep 0.x semantics: snapshot best-effort at intent, render-time
  backstop; server flight collection evaluates in the same request context
  as the render, so gates can't disagree.

Note most auth cases are better served by guard-and-redirect; conditional
subtrees are specifically for stealth 404s.
