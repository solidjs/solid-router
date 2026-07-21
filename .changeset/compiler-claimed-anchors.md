---
"@solidjs/router": minor
---

Plain `<a>` elements now carry link state automatically — no `<A>` wrapper needed. The Solid compiler claims every `a[href]` at creation and re-claims when a dynamic `href` changes; the router consumes those claims (for routers created through `createRouter`) and maintains:

- `aria-current="page"` — the location matches the link exactly
- `data-active` — exact or prefix match (root `/` matches exactly only)
- `data-pending` — the link is the target of an in-flight navigation

State is correct at creation, so late mounts (`<Show>`, `<For>`, portals) are never stale, and it stays live per element with automatic disposal. External, `target`ed, `download`, and `rel="external"` links are left alone; with `explicitLinks` only anchors with the `link` attribute participate; base-path scoping matches click delegation. Style with CSS attribute selectors:

```css
nav a[aria-current="page"] { font-weight: 600; }
nav a[data-active]         { color: var(--accent); }
a[data-pending]            { opacity: 0.6; }
```

Typed path nodes are now valid `href` values directly (`<a href={paths.users(2)}>`): `TypedPath` carries the JSX serializable-attribute brand and SSR stringifies the node into markup.

`useLinkState`'s (and claimed anchors') `pending` now matches the in-flight navigation target explicitly instead of "active while routing", so it reads consistently from both pure computations and effects — effects observe the committed location during a transition and previously could never see the pending state.

Requires the element-claim runtime from `@solidjs/web` (dom-expressions 0.50.0-next.25+).
