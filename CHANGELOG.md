# @solidjs/router

## 1.0.0-next.9

### Patch Changes

- 78eb8a3: Export `DefaultSearchTypes` and `SetSearchParams` from the package entry so consumer builds that emit declarations for an inferred `Router.paths` value don't fail with TS2742 ("cannot be named without a reference to .../dist/paths").
- c1caab1: Fix duplicate revalidation after single-flight mutations. The transport consumer applies `X-Revalidate` metadata and seeds the query cache before the action resolves; the action layer then treated the unwrapped value as a fresh plain result and invalidated the newly seeded cache again, intermittently issuing a follow-up query fetch. An action now tracks whether the flight-data consumer actually ran during its mutation and skips the redundant default pass only in that case — server responses without flight data (no referrer, empty collection pass, no server-side collector) still get the default revalidation.

## 1.0.0-next.8

### Patch Changes

- 47b5e47: Make the link-claims sweep effect hydration-transparent. The sweep is created in the router's client-only branch, so the server never allocates a hydration id for it; when the client-side render effect consumed a child id during hydration, every subsequent id shifted by one slot relative to the server — lazy-route hydration lookups missed ("was not preloaded before hydration") and hydration finished with unclaimed server-rendered nodes. The effect now opts out of the id scheme with the `transparent` node option, the same mechanism component owners use.

## 1.0.0-next.7

### Major Changes

- 9b66caf: Remove the legacy component API. The `createRouter` factory (routes as config
  objects, the instance as the provider component) is now the only way to set up
  the router, and plain `<a>` elements — managed by the compiler-claimed anchor
  integration — are the only link primitive.

  Removed:

  - `<Router>`, `<HashRouter>`, `<MemoryRouter>`, `<StaticRouter>` and the
    `createRouterComponent` integration wrapper. Use
    `createRouter({ routes, history })` with the `browserHistory` (default),
    `hashHistory`, or `memoryHistory` adapters; on the server the request URL
    drives a static integration automatically.
  - JSX `<Route>` (and its `RouteProps` type). Routes are config objects —
    the single source of truth the typed path proxy infers from.
    `createFlightDataCollector` likewise no longer accepts JSX trees; hand it
    config objects, an array, a thunk, or a router instance.
  - `<A>` and `Navigate`. Anchors are plain `<a href>` elements: the claims
    integration applies `aria-current="page"`, `data-active`, and
    `data-pending` automatically, and `useLinkState` remains the escape hatch
    for custom client links. For `Navigate`-style declarative redirects, call
    `useNavigate()` in the route component or redirect from a preload.
  - The `create` hook on `RouterIntegration` (only the legacy components
    called it).

  Renamed:

  - `useCurrentMatches` is now `useRouteMatches` — same behavior, an accessor
    of the router's resolved matches for the current location, outermost
    first. The name draws the line against `useMatch`: one reflects the route
    tree, the other tests a path pattern you supply.
  - `usePreloadRoute` keeps its name and now also accepts typed path nodes
    (`paths.users(2).settings`) alongside strings and URLs.

  `hashParser` moved to `src/routers/history.ts` (exported for integrations);
  `createMemoryHistory` is replaced by the `memoryHistory(initialPath)` adapter,
  which carries `go`/`back`/`forward`/`listen` for tests and tools.

- d642c49: Begin the 1.0 API redesign: routes become config objects created outside JSX through a `createRouter` factory, and the route tree becomes the single source of truth for matching _and_ types.

  - `createRouter({ routes, ... })` returns an instance that is itself the provider component (`<Router>{props => ...}</Router>`); the render-prop child replaces the `root` prop and receives the matched content as `props.children`. The factory's `preload` option replaces `rootPreload`.
  - `Router.paths` is a typed path proxy derived from the route tree: property access descends static segments, calls bind params (`paths.users(id).settings`), and zero-arg or search-object calls terminate to a string (`paths.search({ q, page })`). Param types flow from `matchFilters` (new `int` filter types params as numbers) and search types from an optional per-route Standard Schema `search` validator. Every node coerces via `toString`, and `navigate()`/`useParams()` accept paths nodes.
  - `Router.match(url)` matches arbitrary URLs against the instance with no rendering or request context — for middleware, sitemaps, and tests.
  - History adapters are imported values (`hashHistory()`, `memoryHistory(initialUrl?)`, `browserHistory()`) passed as `config.history`, so unused adapters never enter the bundle; the default is browser history on the client and the request URL on the server.
  - BREAKING: the low-level `createRouter` integration factory export is replaced by the new factory (custom integrations become history adapters). The JSX `<Router>`/`<HashRouter>`/`<MemoryRouter>`/`<StaticRouter>` components and `<Route>` remain for now and will be removed later in the 1.0 line.
  - Fixes `rootPreload`'s return value being dropped: the root section's `data` prop now receives the preload result.

### Minor Changes

- dff457e: Plain `<a>` elements now carry link state automatically — no `<A>` wrapper needed. The Solid compiler claims every `a[href]` at creation and re-claims when a dynamic `href` changes; the router consumes those claims (for routers created through `createRouter`) and maintains:

  - `aria-current="page"` — the location matches the link exactly
  - `data-active` — exact or prefix match (root `/` matches exactly only)
  - `data-pending` — the link is the target of an in-flight navigation

  State is correct at creation, so late mounts (`<Show>`, `<For>`, portals) are never stale, and it stays live per element with automatic disposal. External, `target`ed, `download`, and `rel="external"` links are left alone; with `explicitLinks` only anchors with the `link` attribute participate; base-path scoping matches click delegation. Style with CSS attribute selectors:

  ```css
  nav a[aria-current="page"] {
    font-weight: 600;
  }
  nav a[data-active] {
    color: var(--accent);
  }
  a[data-pending] {
    opacity: 0.6;
  }
  ```

  Typed path nodes are now valid `href` values directly (`<a href={paths.users(2)}>`): `TypedPath` carries the JSX serializable-attribute brand and SSR stringifies the node into markup.

  `useLinkState`'s (and claimed anchors') `pending` now matches the in-flight navigation target explicitly instead of "active while routing", so it reads consistently from both pure computations and effects — effects observe the committed location during a transition and previously could never see the pending state.

  Requires the element-claim runtime from `@solidjs/web` (dom-expressions 0.50.0-next.25+).

- 2abd13b: Add `defineRoutes`, an identity helper with a `const` type parameter that
  preserves route literal types for extracted route trees. Inline arrays passed
  to `createRouter` already infer literally; `defineRoutes` removes the need
  for `as const` on the common pattern of exporting the tree as a separate
  value — and makes the silent type degradation of forgetting it impossible.
- c55d6bf: Forms submitted through delegation are marked `aria-busy="true"` while their action is in flight — the form half of the attribute vocabulary links get (`data-active`/`data-pending`). The attribute covers the mutation and its response handling (revalidation included), survives overlapping submissions of the same form via a counter, and always clears, error or not. Programmatic `useAction` calls have no form and set nothing. Style with CSS:

  ```css
  form[aria-busy] button {
    pointer-events: none;
    opacity: 0.6;
  }
  ```

- 08d35de: Lazy route subtrees: `children` accepts a thunk (`children: () => import("./feature/routes")`) so a section's route table loads on demand while staying part of the one typed tree. Types flow through the import's promise type into `paths` and the typed hooks; hover-intent preloading kicks the table load and cascades into inner route preloads when it lands; navigation into an unresolved subtree folds the load into the transition (old screen holds); SSR and the single-flight collector resolve matched boundaries server-side. Resolution is cached per thunk and append-only. Async boundaries require the streaming render entry points (`renderToStream`/`renderToStringAsync`); the module's `default` or `routes` export (or a direct array) is used.
- ff75957: Add `useLinkState` — reactive `active`/`current`/`pending` state for custom link components, the programmatic counterpart of the attribute vocabulary plain anchors will receive (`aria-current`, `data-active`, `data-pending`). `<A>` now derives its active/current state from it, so both share one semantics (trailing-slash and case handling, `end` for exact-only). Accepts typed paths nodes as well as strings.

  `createFlightDataCollector` also accepts a `createRouter` instance directly: its routes, base, and `preload` are read off the instance config, so server wiring stays a one-liner (`createFlightDataCollector(Router)`).

- 6655835: Typed, parsed search params. Passing a paths node to `useSearchParams(paths.search)` opts into Standard Schema parsing: the schemas of the currently matched routes run root→leaf over the raw query and their outputs merge over it, so reads return the schema's output type (defaults applied, values coerced) and the setter is typed by the schema's input. A schema that reports issues is skipped, leaving raw values — search strings are user input, so defaults belong in the schema. Zero-arg `useSearchParams()` keeps today's raw string-valued behavior. Async schema validation throws.

### Patch Changes

- 5bf9f13: Rework link-claim state to a single render effect that sweeps a registry of claimed anchors, replacing the per-anchor render effect. Behavior is unchanged — every anchor still depends on the same location sources, so nothing was gained from per-element granularity — but each claimed anchor now costs a registry entry and a cleanup hook instead of a full reactive node with dependency links, cutting per-anchor memory roughly 6x and making claim/unclaim on link-heavy pages cheaper.
- 366e130: Decouple the data layer from the router core so Router-only apps tree-shake query/action/flash entirely. The coupling inverts across three seams, each a slot the action side fills on first `action()` creation: form submits consult a handler slot in events.ts instead of importing the actions map; single-flight registration becomes a rendezvous in routing.ts (the Router registers, the action side provides the consumer — either order works, so lazily loaded action modules attach to an already-mounted router, and a router-only app never subscribes so the server is never asked to collect); and the submissions signal allocates lazily with the flash codec provided from the action side (the one-shot cookie clear stays eager per request via the new tiny flashCookie.ts half, so Set-Cookie still precedes streaming flushes and unread outcomes cannot haunt later renders). No behavior changes; bundle checks confirm a Router-only entry excludes action.ts, query.ts, the flash codec, and the @solidjs/web/server-functions import.
- 1e3427a: Make the `beforeLeave` guard machinery tree-shakeable. The router and history adapters now carry an empty slot instead of eagerly creating the guard; `useBeforeLeave` installs it on first use. Apps that never block navigation shed the whole confirm/retry/event machinery (~0.85 KB min / 0.27 KB gzip on the router-only client bundle). Depth stamping on history state stays always-on so back/forward blocking remains exact regardless of when the first guard subscribes.
- 1e3427a: Construct the typed `paths` proxy lazily on first access instead of eagerly in `createRouter`. On runtimes without `Proxy` support (some older smart TVs), creating a router no longer throws — only touching `instance.paths` does.
- 7e312af: Require `solid-js` / `@solidjs/web` `2.0.0-beta.22` — the first published beta carrying the element-claim runtime contract (`registerElementClaim`, compiler claim emission) and the self-describing action url support the claims consumer and server-component form delegation build on.
- 73f3f00: Delegate form submissions for server-rendered action urls without client-side registration. A form bound directly to a server action in a server component ships no client JS of its own — its `action="/_server?id=...&args=..."` url is self-describing, so the router now synthesizes the invocation from the url instead of falling back to a native (no-JS) post:

  - `handleFormAction` on a registry miss for a url under `actionBase` creates a generic action from the url's `?id` (bound `.with()` arguments stay in `?args`, which the server reads for natural-encoding bodies exactly as it does for no-JS posts) and posts the form data to it verbatim through the server-function transport. Submissions, `aria-busy`, redirects, revalidation, and single-flight data all flow through the normal action pipeline, so invalidation falls through the client router as usual. The synthesized action registers under the url, so repeat submits reuse it and a real registration takes precedence.
  - Delegation now intercepts POSTs to `actionBase` urls even when no action module is in the client graph at all, loading the handler lazily on first submit (a new `serverForms` split point in the `solid` condition's per-module graph — router-only bundles stay lean, the initial-chunk cost is ~0.4 KB gzip for the synchronous intercept). No-JS submission remains the fallback only for clients with no JS. The no-build flat bundle inlines the import instead of splitting.

  Client-only actions (`https://action/...`) still require their module — they are user JS by definition.

- f64713c: Server renders without a request event (SSG scripts, server-side tests) take
  the location from the configured history adapter, so
  `createRouter({ routes, history: memoryHistory("/page") })` renders that page
  isomorphically — the replacement for `<StaticRouter url>`. With a request
  event the URL still comes from the request; the fallback stays a static read
  (no signal machinery), so server bundles are unchanged and history adapters
  remain opt-in imports.
- 08d35de: Warn in development when a router instance mounts inside another router. One router owns the session per app — location, history, delegation, link claims, preloading — and a second live instance fights it (stale content on click navigations, conflicting link attributes). Nested routing hasn't been supported since nested `<Routes>` was removed in 0.10; compose route trees in one `createRouter` config instead. Lazy route subtrees are the planned mechanism for definitions unknown at build time.

## 0.17.0-next.6

### Patch Changes

- 5f1f323: `query()` no longer sniffs the legacy `.GET` property off server functions
  (removed from the core runtime along with `.withOptions`). GET-ness is a
  declaration now — a core `GET(fn)` reference already calls over GET, so
  there is no transport to swap; where the router needs to _know_, the
  detection contract is `getServerFunctionMetadata(fn)?.method === "GET"`
  from `@solidjs/web/server-functions`. Undeclared server functions passed
  to `query()` still get GET transport — query implies GET (see the
  companion changeset): the upgrade is now a real `GET(fn)` declaration
  instead of a property swap.
- b193cdc: Own single-flight mutations and the no-JS form convention end to end on the core server-function protocol (requires the solid release bridging `subscribeFlightData`/`collectFlightData` through `@solidjs/web/server-functions`) — the policies SolidStart previously implemented in its handler now live in the router, since their vocabulary (query cache keys, submissions) is the router's.

  Client: the `<Router>` registers the router as the transport's flight-data consumer (`subscribeFlightData`) on the client. Subscribing is the opt-in — the transport sends the `X-Single-Flight` request header itself on mutations, so actions no longer wrap server functions in `withOptions({ headers })` per call. Delivered payloads seed the `query` cache and apply the envelope metadata (redirect `Location` navigation, `X-Revalidate` invalidation) before the action sees its plain return value; the old `_$value` magic-key decode is gone (the standardized `{ value, data }` shape is still understood on the manual pass-through path). `singleFlight={false}` now simply never subscribes: no consumer, no request header, no collection work on the server.

  Server: a new server-only entry, `@solidjs/router/server`, exports the integration an app (or SolidStart) wires into `configureServerFunctionsServer` / `handleServerFunctionRequest`:

  - `createFlightDataCollector({ routes, rootPreload, base })` produces the `collectFlightData` hook — a pure preload runner, no app render involved. `routes` accepts exactly what `<Router>` accepts as children — JSX `<Route>` trees, config objects, or a thunk producing either — normalized through the same resolution the `<Router>` uses (on the server `Route` evaluates to its definition, so JSX trees need no render pass). The post-mutation URL (redirect `Location`, else the referrer) is matched against the tree and the matched routes' `preload`s run in data-only mode; `rootPreload` (the same function passed to `<Router rootPreload>`) runs first with real-render semantics (merged params, `intent: "initial"`). The collector also owns folding the mutation's `Set-Cookie`s into the collection request (`createSingleFlightHeaders`) and reading the collected data off the event.
  - `createNoJSHandler({ base })` produces the `handleNoJS` hook: form posts made without the client runtime redirect back (303, or the result's redirect) with the outcome in a one-shot `flash` cookie. The router's SSR initialization now reads — and clears — that cookie itself to seed submission state (an explicitly pre-seeded `event.router.submission` still takes precedence), so `useSubmission()` renders no-JS outcomes with no framework glue. The cookie format is new: form inputs ride as tagged entry arrays and revive to real `FormData`/`URLSearchParams`.

- 73b52c4: `query()` automatically declares GET transport for server functions. The
  router primitive is the declaration site: passing a server function to
  `query()` wraps it with core `GET(fn)` at query-creation time (module
  scope), so the server half records the method declaration for dispatch and
  the client half calls over cacheable GET — no manual wrapping needed.
  Explicitly `GET(fn)`-declared references pass through unchanged, and
  non-server functions are untouched. The declaration grants GET without
  revoking POST, so the same function stays callable directly over the
  default transport.
- 7051c96: Update to Solid 2.0.0-beta.21, the release that bridges the single-flight core protocol (`subscribeFlightData`/`collectFlightData` and `getServerFunctionMetadata`) through `@solidjs/web/server-functions`. Peer dependency floor raised to `2.0.0-beta.21` since the router's single-flight and GET-detection paths depend on that bridge.

## 0.17.0-next.5

### Patch Changes

- c9f8c25: Adopt the core server-function protocol from `@solidjs/web` (requires the
  solid release shipping the `server-functions` subpath). The router's
  `redirect`/`reload`/`json` response helpers are removed — import `redirect`,
  `reload`, and `respond` from `@solidjs/web` instead. Actions and queries now
  consume `ResponseEnvelope` values (what `respond()` returns) directly in
  memory, and decode transport pass-through responses (redirects, revalidation,
  single-flight payloads) themselves via `decodeResponse` from
  `@solidjs/web/server-functions` — the `customBody` expando and the
  `CustomResponse` type are gone (`NarrowResponse` now narrows through
  `ResponseEnvelope`).

## 0.17.0-next.4

### Patch Changes

- 2596327: Fix params becoming undefined in outgoing components during navigation.

  Route roots are now created under the `Routes` component owner so they survive re-runs of the route state memo (Solid 2 disposes roots created inside a computation when it re-runs). Each route context also gets params scoped to its own lifetime: they retain their last values while the route is being torn down, so effects and async fetches in outgoing components (e.g. kept alive by a `<Loading>` boundary) never observe another route's params. This also removes the incorrect fallback that could hand a route context another route's match during teardown.

- bc38fb2: Update to Solid 2.0.0-beta.18. JSX types now come from `@solidjs/web` (core `solid-js` no longer exports the `JSX` namespace), so the `<A>` anchor attribute augmentation moved to `@solidjs/web/jsx-runtime` and `RouterIntegration.signal` is now a plain getter/setter pair instead of solid's branded `Signal` type. Peer dependency floor raised to `2.0.0-beta.18`.

## 0.17.0-next.3

### Patch Changes

- 988dcce: fix error with cache signal setter

## 0.17.0-next.2

### Patch Changes

- 1350ea9: Update to Solid 2.0 beta.7: remove `createMemo` initialValue args, rename `pureWrite` to `ownedWrite`, collapse `reference`/`state` memos into single `effective` memo, and inline `intercept` helper. Peer deps now require `>=2.0.0-beta.7 <2.0.0-experimental.0`.

## 0.17.0-next.1

### Patch Changes

- cd29312: Fix a client-side navigation rendering regression and remove a Solid 2 warning triggered during router setup.

  This keeps route outlet consumption in a tracked render path and avoids reading the router source signal directly during construction.

## 0.17.0-next.0

### Minor Changes

- afc50c5: Update the router for the Solid 2 beta runtime and align its data APIs with the new async and action model.

  This release removes deprecated async wrappers, updates action and submission behavior around Solid 2 actions, refreshes the documented optimistic patterns, and includes the related router/runtime compatibility changes needed for the beta branch.

## 0.16.2

### Patch Changes

- 676db85: fix #451 - dispose per-route roots when the route tree unmounts; leaked roots stayed subscribed to route matches and crashed with `TypeError: ... (evaluating 'match().path')` on a later navigation (e.g. when a `<Show>` in the root component hid the outlet during login/logout flows)
- cae1d15: Fix a batch of long-standing bugs:

  - `useSubmission().retry` was always a no-op due to an operator-precedence bug (#504)
  - disposing an older owner no longer unregisters a newer action bound to the same URL, which caused forms to fall through to native submission after revalidation (#542)
  - `useBeforeLeave` listeners now observe `defaultPrevented` set by other listeners (#530)
  - `<A>` active state now ignores trailing slashes on `href` (#532)
  - `useCurrentMatches` returns a copy so user mutation can't corrupt router state (#516)
  - static path segments no longer percent-encode RFC 3986 pchar characters (`+`, `@`, `:`, `$`, `&`, `,`, `;`, `=`), so routes like `/+foo` or `/@user` match the browser's raw pathname (#559, #509)
  - consecutive synchronous `setSearchParams` calls now compose: the merge applies to the in-flight navigation target instead of the stale committed location (#547)

- e9acd69: fix #454 - default `RouteDefinition`'s data generic to `any` so typed components and preload functions are assignable in annotated configs like `const routes: RouteDefinition[]`, where no inference site for the generic exists
- 9d80d4e: Paths with empty interior segments (doubled slashes, e.g. `//dash` or `/foo//bar`) no longer match routes and now render the not-found state instead of silently matching their collapsed form (#567). A single trailing slash is still tolerated. Doubled leading slashes are also no longer normalized away by the browser integration and parse correctly instead of being treated as protocol-relative URLs.
- b308c21: fix #497 - `revalidate` now forces the cache miss synchronously instead of deferring it into the transition microtask, so a same-tick `refetch()` after an un-awaited `revalidate()` refetches fresh data
- e9acd69: fix #347 - accept `VoidComponent` pages as route components; `component` now takes a `RouteSectionComponent` union so components that don't declare `children` type-check, while components requiring props the router doesn't pass are still rejected

## 0.16.1

### Patch Changes

- e847f96: Fix the published package contents so `dist` no longer includes mirrored `src`, `test`, or co-located spec files.

  Also move the data tests under `test/` and align the test TypeScript config with that layout so `test:types` continues to pass cleanly.

## 0.16.0

### Minor Changes

- 8f0a8c3: Re-export context
- 9e85fe2: Update `moduleResolution`

### Patch Changes

- 63940c5: Use `name` in `action` and `createAsync`

  `action()` and `createAsync()` were not respecting user defined name.
  Moreover, action was not applying the hashed name and only naming the action "mutate".

- f9b6dc6: Make useHref return a string with string param

## 0.15.4

### Patch Changes

- da5e1f9: allow URLSearchParams type for when enctype is not set to multipart/form-data
- 1aa664e: - Improve route matching fallback
  - Optimize imports
- fa46b67: fix(type): allow value from `Params` and `SearchParams` to be optional
- bd89541: Support `in` operator for useParams()
- 0a2f556: preserve headers in `query()`'s `handleResponse()`
- ac97470: added `SearchParams` to the exported types
- 8885abf: fix: createAsync - catch errors of prev to avoid bubbling error up
- d665cc9: Fix Router popstate event handling logic

  - Simplified delta check logic for history navigation
  - Improved reliability of forward navigation detection
  - Fixed window.history.forward() navigation handling

## 0.15.3

### Patch Changes

- 97184e4: more lenient on cache resuming (allow nested promises during hydration)

## 0.15.2

### Patch Changes

- fe5c83e: Add JSdoc
- 9a5e350: Vite 6 compatibility
- 20ad18f: only clear completed actions on navigation

## 0.15.1

### Patch Changes

- f3763aa: Export Submission at the top level
- 813e6bd: fix `onComplete` return type

## 0.15.0

### Minor Changes

- 6799556: rename `cache` to `query`, action `onComplete`

## 0.14.10

### Patch Changes

- 18b9b52: Support arrays in Search Params
- 272218f: fix #491 - useSubmission with "with" actions

## 0.14.9

### Patch Changes

- a22d7d2: fix preloadRoute to take string path
- 6dd0473: support empty array/string to mean no revalidation

## 0.14.8

### Patch Changes

- a3a36fb: Add query and param wrappers to support non-Proxy envs
- 2475851: bump deps
- 2f1fa18: improve anchor preload performance

## 0.14.7

### Patch Changes

- 3594e45: fix iterator methods on useSubmissions

## 0.14.6

### Patch Changes

- 0a964b6: Fix duplicated push history
- c61231d: Fix scrollToHash to handle hashes starting with a number
- 83b7093: remove extra code, fix #406 slow perf on localeCompare

## 0.14.5

### Patch Changes

- 5c87acc: fix partial matches in single flight mutations

## 0.14.4

### Patch Changes

- 098dccb: fix #474 improper search parameter resolution while routing
- f8f30df: fix initial state including \_depth

## 0.14.3

### Patch Changes

- 19a21cc: fix async store references
- f8aaf16: make url transform consistent
- 86c3b1f: better handling of query only navigation

## 0.14.2

### Patch Changes

- bc3d8e3: expose .latest from createAsync
- fc6ac53: fix #464 flaky hydration bail out
- 3295502: fix hydration cancellation on browser events

## 0.14.1

### Patch Changes

- 6144da8: fix Response type narrowing in submission APIs

## 0.14.0

### Minor Changes

- e4a13f6: Response helpers return responses, cache/action filter them out
- bd9f19a: default form actions to url encoded
- 5d9263b: rename load to preload

### Patch Changes

- a7e4062: fix #457 extra leading slashes on path
- 4b4536e: add usePreloadRoute export
- 8cc0530: hack the types to work a bit better with Response Unions

## 0.13.6

### Patch Changes

- 7344f69: Handle absolute redirects within `cache` on server
- 8263115: Forward absolute redirects inside `cache` from server to client
- 8fbf74a: Treat `window.location.hash` as URI encoded
- e9fd55d: fix #449 No JS submissions not working
- f311f4a: fix #452 useSubmission types/references
- 2f05f37: Make isRouting more reliable + other fixes
- 618ef17: performance improvement leveraging redirects in loadfn
- d81473a: usePreloadRoute method pre-release

## 0.13.5

### Patch Changes

- bfb059f: types Route -> RouteDescription

## 0.13.4

### Patch Changes

- 00e37fd: Export all types used in public API
- 2e90de5: Fix `HashRouter` state reset with `replace: false`
- 75472d2: Fix useCurrentMatches a getter function

## 0.13.3

### Patch Changes

- 884b8be: fix #374, fix #399 - suppress cache errors in load function
- 4a76e7d: Fix state updates detection on history back/forward
- 5af3da8: fix #407 single flight without explicit keys
- 1068f1b: fix #408 - accessing route information
- 0c698ed: Allow rewriting url

## 0.13.2

### Patch Changes

- 0a34883: preserve original path on optional segments
- 94797e1: Fix types for cache functions with all optional arguments
- 8a547a8: don't submit form when submit event is defaultPrevented

## 0.13.1

### Patch Changes

- 8b766a9: restore params into root

## 0.13.0

### Minor Changes

- 7b1597b: Add errors to actions

### Patch Changes

- 83e827d: minimum types for submission flash
- 6df4a7a: push root/rootLoad outside of route matching

## 0.12.5

### Patch Changes

- fdefceb: fix #388 reference to element prop
- ffbd35a: fix #389 update router context error message
- bceb358: fix backcache storing invalidated values

## 0.12.4

### Patch Changes

- 533b7a0: fix unintended early return in cache during server render

## 0.12.3

### Patch Changes

- 02c6e7a: action to return fully processed response

## 0.12.2

### Patch Changes

- 5e8cbdb: apply the right owner (who's aware of the router)

## 0.12.1

### Patch Changes

- 6d0be9e: fix cache serialization to match returned value
- 052d385: Run load functions with owner & context of `Router` component.

## 0.12.0

### Minor Changes

- 17ea145: add createAsyncStorage, prev argument, remove store from cache

## 0.11.5

### Patch Changes

- 0413594: fix memory router no native events
- 97d387b: add `rootLoad`
- 5a94e7d: fix Router types, make singleFlight optional

## 0.11.4

### Patch Changes

- d67ccbb: single flight mutations
- 76724af: pass revalidate through `json` helper

## 0.11.3

### Patch Changes

- 9cc1a85: update response types to be always present

## 0.11.2

### Patch Changes

- fab3cc0: fix renderToString for cache fns

## 0.11.1

### Patch Changes

- 20663d5: metadata -> info

## 0.11.0

### Minor Changes

- 6e661eb: add changesets
