[![Banner](https://assets.solidjs.com/banner?project=Router&type=core)](https://github.com/solidjs)

<div align="center">

[![Version](https://img.shields.io/npm/v/@solidjs/router.svg?style=for-the-badge&color=blue&logo=npm)](https://npmjs.com/package/@solidjs/router)
[![Downloads](https://img.shields.io/npm/dm/@solidjs/router.svg?style=for-the-badge&color=green&logo=npm)](https://npmjs.com/package/@solidjs/router)
[![Stars](https://img.shields.io/github/stars/solidjs/solid-router?style=for-the-badge&color=yellow&logo=github)](https://github.com/solidjs/solid-router)
[![Discord](https://img.shields.io/discord/722131463138705510?label=join&style=for-the-badge&color=5865F2&logo=discord&logoColor=white)](https://discord.com/invite/solidjs)
[![Reddit](https://img.shields.io/reddit/subreddit-subscribers/solidjs?label=join&style=for-the-badge&color=FF4500&logo=reddit&logoColor=white)](https://reddit.com/r/solidjs)

</div>

**Solid Router** brings fine-grained reactivity to route navigation. Routes are config objects — the single source of truth for matching *and* types — and the router upgrades HTML's own interaction verbs instead of wrapping them: `<a href={path}>` and `<form action={action}>` carry typed, URL-addressable values on real platform elements, intercepted by delegation, decorated with a shared attribute vocabulary, and fully functional without JavaScript.

Explore the official [documentation](https://docs.solidjs.com/solid-router) for detailed guides and examples.

## Core Features

- **Typed Routing**: URLs built through a typed path proxy inferred from your route config — `paths.users(2).settings` typechecks against the tree
- **Plain Anchors**: no link component — `<a>` elements get `aria-current`, `data-active`, and `data-pending` automatically via compiler-claimed anchors
- **Universal Rendering**: one factory for browser, hash, memory, and server rendering; history adapters are imports, so unused ones never enter your bundle
- **Preload Functions**: parallel data fetching following the render-as-you-fetch pattern, triggered eagerly on link hover/focus
- **Data APIs with Caching**: `query` and `action` with deduplication, revalidation, single-flight mutations, and progressive enhancement
- **Typed Search Params**: opt-in per-route [Standard Schema](https://github.com/standard-schema/standard-schema) validation — `search.page` is a `number`, not `"2"`

## Table of Contents

- [Getting Started](#getting-started)
- [The Mental Model: Instance vs Hooks](#the-mental-model-instance-vs-hooks)
- [Route Definitions](#route-definitions)
  - [Dynamic Routes](#dynamic-routes)
  - [Match Filters](#match-filters)
  - [Optional Parameters](#optional-parameters)
  - [Wildcard Routes](#wildcard-routes)
  - [Multiple Paths](#multiple-paths)
  - [Nested Routes](#nested-routes)
  - [Lazy Route Subtrees](#lazy-route-subtrees)
- [Typed Paths](#typed-paths)
- [Links](#links)
- [Preload Functions](#preload-functions)
- [Data APIs](#data-apis)
- [Typed Search Params](#typed-search-params)
- [Router Config Reference](#router-config-reference)
- [Router Primitives](#router-primitives)
- [Other Environments](#other-environments)
- [Server Integration](#server-integration)
- [Migration from 0.x](#migration-from-0x)
- [SPAs in Deployed Environments](#spas-in-deployed-environments)

## Getting Started

```bash
# use preferred package manager
npm add @solidjs/router
```

Define your routes as config objects and create the router outside JSX. The instance is the provider component, and `paths` is a typed URL builder inferred from the tree:

```tsx
// app/router.ts
import { lazy } from "solid-js";
import { createRouter } from "@solidjs/router";

export const Router = createRouter({
  routes: [
    { path: "/", component: lazy(() => import("./pages/Home")) },
    { path: "/about", component: lazy(() => import("./pages/About")) },
    {
      path: "/users/:id",
      component: lazy(() => import("./pages/User")),
      children: [
        { path: "/", component: lazy(() => import("./pages/UserOverview")) },
        { path: "/settings", component: lazy(() => import("./pages/UserSettings")) }
      ]
    },
    { path: "*404", component: lazy(() => import("./pages/NotFound")) }
  ]
});

export const { paths } = Router;
```

This one module serves everything: the client renders the instance, and on the server the same instance reads its location from the request (or the configured history when there is none — SSG, tests). There is no separate "server router" and no need to export the raw route array.

When a tree is composed across files (feature subtrees), wrap the extracted arrays in `defineRoutes` — an identity function that preserves the literal types inference feeds on (a bare extracted array silently widens to `string` paths without it or `as const`) and type-checks the definitions where they're written:

```tsx
// features/admin/routes.ts
export const adminRoutes = defineRoutes([
  { path: "/admin", component: Admin, children: [/* ... */] }
]);

// app/router.ts
export const Router = createRouter({ routes: [...appRoutes, ...adminRoutes] });
```

Mount it by rendering the instance. The render-prop child is your root layout — it always stays mounted, receives the matched content as `props.children`, and is the ideal place for top-level navigation and context providers:

```tsx
// app/index.tsx
import { render } from "@solidjs/web";
import { Router } from "./router";

render(
  () => (
    <Router>
      {props => (
        <>
          <h1>My Site with lots of pages</h1>
          {props.children}
        </>
      )}
    </Router>
  ),
  document.getElementById("app")!
);
```

Links are plain anchors. Typed path nodes coerce to strings on the attribute, and the router intercepts clicks through delegation:

```tsx
import { paths } from "./router";

<nav>
  <a href={paths()}>Home</a>
  <a href={paths.about}>About</a>
  <a href={paths.users(user.id).settings}>Settings</a>
</nav>;
```

## The Mental Model: Instance vs Hooks

The API splits across two surfaces, and the line between them is precise: **could two concurrent server requests give different answers? If yes, it's a hook. If no, it's on the instance.**

The instance is shared — one module-level object serving every mount, every request, every test. It is deliberately non-stateful (on the server there are many "current locations" at once), so it carries only the app's static routing vocabulary. Hooks read the live session from context.

| Instance — facts about the *app* | Hooks — facts about the *session* |
| --- | --- |
| `paths` — how to spell URLs | `useLocation`, `useParams` — where am I |
| `match(url)` — how would a URL match | `useNavigate`, `usePreloadRoute` — move / warm |
| `routes`, `config` — what exists | `useIsRouting`, `useRouteMatches`, `useSearchParams` — live state |

They compose as noun and verb — the instance supplies a typed URL, the hook acts on the current session:

```tsx
const navigate = useNavigate();
navigate(paths.users(2));                 // verb(noun)

const params = useParams(paths.users);    // hook, typed by the instance
```

**Hooks are the default; import the router only when you need typed URLs or matching outside a render.** Components that only read their session (params, location, string-path navigation) never need the instance — which also means component files don't form import cycles with the router module that references them in its config.

## Route Definitions

A route definition supports:

| key            | type                                    | description                                                        |
| -------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `path`         | `string \| string[]`                    | Path partial for this route segment                                |
| `component`    | `Component`                             | Component rendered for the matched segment                         |
| `children`     | `RouteDefinition \| RouteDefinition[] \| () => Promise<...>` | Nested route definitions, or a thunk for a [lazy subtree](#lazy-route-subtrees) |
| `preload`      | `RoutePreloadFunc`                      | Called on preload intent (hover/focus) and navigation              |
| `matchFilters` | `MatchFilters`                          | Additional constraints for matching parameters                     |
| `search`       | `StandardSchemaV1`                      | Search-param validator; its types flow into `paths` and hooks      |
| `info`         | `Record<string, any>`                   | Arbitrary metadata, readable via `useRouteMatches`                 |

The tree is **immutable and there is one router per app** — that's what makes `paths` and the typed hooks truthful, it lets matching compile once and be shared by every mount, request, and `match()` call, and it means delegation, link state, and preloading all have a single owner. Compose large apps by spreading subtrees into the config (see `defineRoutes` above); mounting a router inside another router is not supported (nested `<Routes>` has been gone since 0.10) and warns in development. Sections whose *code* shouldn't load up front are [lazy route subtrees](#lazy-route-subtrees) — still one tree, still typed.

### Dynamic Routes

Treat part of the path as a parameter with a colon:

```tsx
const routes = defineRoutes([
  { path: "/users", component: Users },
  { path: "/users/:id", component: User }
]);
```

As long as the URL fits the pattern, the `User` component shows, and `id` is available via `useParams`.

**Note on Animation/Transitions**: routes that share the same path match are treated as the same route. To force a re-render, wrap your component in a keyed `<Show>`:

```tsx
<Show when={params.something} keyed>
  <MyComponent />
</Show>
```

### Match Filters

Each parameter can be validated with a `MatchFilter` — an enum array, a regex, or a predicate. If validation fails, the route doesn't match:

```tsx
import { int, type MatchFilters } from "@solidjs/router";

const filters: MatchFilters = {
  parent: ["mom", "dad"],                                    // enum values
  id: /^\d+$/,                                               // only numbers
  withHtmlExtension: (v: string) => v.length > 5 && v.endsWith(".html")
};

const routes = defineRoutes([
  { path: "/users/:parent/:id/:withHtmlExtension", component: User, matchFilters: filters }
]);
```

So `/users/mom/123/contact.html` matches, while `/users/aunt/123/contact.html` (invalid `parent`) and `/users/mom/me/contact.html` (non-numeric `id`) don't.

The built-in `int` filter is *typed*: it constrains matching to integers at runtime and types the param as `number` at `paths` callsites:

```tsx
{ path: "/users/:id", matchFilters: { id: int }, component: User }

paths.users(123);   // ok
paths.users("abc"); // type error
```

### Optional Parameters

Add a question mark to make a parameter optional:

```tsx
// Matches stories and stories/123 but not stories/123/comments
{ path: "/stories/:id?", component: Stories }
```

### Wildcard Routes

Use `*` to match any remainder of the path, optionally naming it to expose it as a parameter:

```tsx
{ path: "foo/*", component: Foo }     // matches foo/, foo/a, foo/a/b/c
{ path: "foo/*any", component: Foo }  // rest of the path available as params.any
```

The wildcard token must be the last part of the path; `foo/*any/bar` won't create any routes.

### Multiple Paths

An array of paths lets a route stay mounted (no re-render) when switching between locations it matches:

```tsx
// Navigating from login to register does not re-render Login
{ path: ["login", "register"], component: Login }
```

### Nested Routes

Only leaf nodes become routes. A parent with a `component` wraps its children, which render where the parent places `props.children`:

```tsx
function PageWrapper(props) {
  return (
    <div>
      <h1>We love our users!</h1>
      {props.children}
      <a href={paths()}>Back Home</a>
    </div>
  );
}

const routes = defineRoutes([
  {
    path: "/users",
    component: PageWrapper,
    children: [
      { path: "/", component: Users },
      { path: "/:id", component: User }
    ]
  }
]);
```

You can nest indefinitely. In this example the only route created is `/layer1/layer2`, rendered as three nested divs:

```tsx
{
  path: "/",
  component: props => <div>Onion starts here {props.children}</div>,
  children: [{
    path: "layer1",
    component: props => <div>Another layer {props.children}</div>,
    children: [{ path: "layer2", component: () => <div>Innermost layer</div> }]
  }]
}
```

### Lazy Route Subtrees

`children` also accepts a thunk, so a whole section's route table (not just its components) stays out of the initial bundle:

```tsx
// admin/routes.ts
export default defineRoutes([
  { path: "/", component: lazy(() => import("./Dashboard")) },
  { path: "/users/:id", matchFilters: { id: int }, component: lazy(() => import("./User")) }
]);

// app.ts
const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/admin", component: AdminShell, children: () => import("./admin/routes") }
  ]
});
```

The import only fires when something needs the subtree — hovering a link into it, navigating into it, or the server matching a URL beneath it. Until then the tree carries a placeholder that knows every URL under `/admin` belongs to the subtree without knowing its contents (static sibling routes still win without triggering the load). Everything folds in as if the routes were inline:

- **Types**: TypeScript never runs the thunk — inference flows through the import's promise type, so `paths.admin.users(2)` typechecks (match filters and search schemas included) before any of the subtree's code exists client-side. The module's `default` or `routes` export is used. Only tables genuinely built at runtime (typed as plain `RouteDefinition[]`) degrade to untyped.
- **Navigation**: the table load folds into the navigation transition — the old screen holds until the subtree (and its matched components) are ready, exactly like a `lazy()` route component.
- **Preloading**: hover intent kicks the table load, and when it lands the preload continues into the inner routes' components and `preload` functions — one cascading warm-up from the earliest possible moment.
- **Server**: SSR resolves matched boundaries during the render (use the streaming entry points — `renderToStream`/`renderToStringAsync` — as with any async work), and the single-flight collector resolves them before its data pass.

Resolution is cached per thunk and append-only: the tree never changes shape after a subtree lands, it just gets more specific. Keep thunks deterministic — `() => import(...)` — rather than switching tables on runtime state.

## Typed Paths

`paths` is a proxy inferred from the route tree. Property access descends into static segments, calls bind params, and it mirrors URL anatomy — params, then a search object, then a hash string:

```tsx
paths.users(123)                          // ok — matchFilters flow into the callsite
paths.users(2).settings                   // chainable into children
paths.users(2, { tab: "x" }, "comments")  // "/users/2?tab=x#comments"
paths.about()                             // zero-arg/search calls terminate to a plain string
paths()                                   // "/" — the root
```

Every node coerces via `toString`, so nodes drop straight into `href`, `navigate()`, and `redirect()` without explicit termination. Accessing a segment that doesn't exist in the tree, or binding a param with the wrong type, is a compile error.

## Links

There is no link component. Use `<a>`; the router intercepts same-origin clicks through delegation and manages link state through compiler-claimed anchors — correct at creation (so late mounts under `<Show>`, `<For>`, or portals are never stale) and refreshed if a dynamic `href` changes.

Behavior modifiers are attributes, so they work identically in client, server-rendered, and third-party markup:

| attribute  | description                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| `replace`  | Replace the history entry instead of pushing                                   |
| `noscroll` | Turn off scrolling to the top after navigation                                 |
| `state`    | JSON string [pushed](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) onto the history stack |
| `preload`  | Set to `"false"` to opt this link out of hover/focus preloading                |
| `link`     | Marks a router link when `explicitLinks` is enabled                            |
| `target`   | Any value (e.g. `_self`) opts the anchor out of router handling                |

```tsx
<a href={paths.login} replace>Log in</a>
<a href={paths.docs} noscroll>Docs</a>
<a href="https://example.com">External — untouched</a>
```

Active and pending state is styled with CSS — one vocabulary for every kind of link:

```css
nav a[aria-current="page"] { font-weight: 600; }        /* exact match */
nav a[data-active]         { color: var(--accent); }    /* exact or prefix match */
a[data-pending]            { opacity: 0.6; }            /* target of in-flight navigation */
```

(The root path only ever matches exactly, so `href={paths()}` doesn't light up on every page.)

For component-library links that need reactive state beyond CSS, `useLinkState` is the programmatic counterpart of the attribute vocabulary:

```tsx
import { useLinkState } from "@solidjs/router";

function TabLink(props: { href: string; children: JSX.Element }) {
  const link = useLinkState(() => props.href);
  return (
    <a href={props.href} class="tab" data-selected={link.active() || undefined}>
      {props.children}
    </a>
  );
}
```

## Preload Functions

Even with smart caches, waterfalls happen when data fetching waits on view logic or lazy-loaded code. Preload functions start fetching data in parallel with loading the route — called when a route renders, and eagerly when links are hovered or focused.

```tsx
import { lazy } from "solid-js";

const User = lazy(() => import("./pages/users/[id].js"));

function preloadUser({ params, location }) {
  void getUser(params.id);
}

const routes = defineRoutes([{ path: "/users/:id", component: User, preload: preloadUser }]);
```

The preload function receives:

| key      | type                                            | description                                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| params   | object                                          | The route parameters (same value as `useParams()` inside the route component)                                                                                                                                                                    |
| location | `{ pathname, search, hash, query, state, key }` | Path information (corresponds to [`useLocation()`](#uselocation))                                                                                                                                                                                |
| intent   | `"initial" \| "navigate" \| "native" \| "preload"` | Why this is being called: `initial` — first render; `navigate` — router navigation; `native` — browser back/forward; `preload` — link hover/focus, not navigating |

The factory-level `preload` option is the app-wide counterpart: it runs once per mount/request with the merged params of every match, and its result reaches the root render-prop as `props.data`.

## Data APIs

These are entirely optional, but they demonstrate the power of the preload mechanism.

### `query`

Wrap a fetching function to dedupe calls and participate in revalidation:

```tsx
const getUser = query(async id => {
  return (await fetch(`/api/users/${id}`)).json();
}, "users"); // query key; arguments are serialized alongside it
```

A query:

1. Dedupes on the server for the lifetime of the request.
2. Fills a preload cache in the browser lasting 5 seconds, so hover preloads and route entry share one fetch.
3. Refetches reactively by key on action revalidation.
4. Serves as a back/forward cache for browser navigation up to 5 minutes; user-initiated navigation bypasses it.

Consume results directly with Solid primitives — there is no router-specific async wrapper:

```tsx
const user = createMemo(() => getUser(params.id));
return <h1>{user().name}</h1>;

// deeply reactive object data
const todos = createProjection(() => getTodos(), []);
```

Keys support targeted invalidation:

```ts
getUser.key;       // "users"
getUser.keyFor(5); // "users[5]"
```

Revalidate with the `revalidate` export or by setting `revalidate` keys on action responses — the whole key invalidates every entry for the query, `keyFor` invalidates one.

### `action`

A router action is *an action with a URL* — Solid's mutation primitive plus URL addressability, submission tracking, and response handling. Data helpers come from the router; response helpers (`redirect`, `reload`) come from `@solidjs/web` — they're protocol-level and work without the router:

```tsx
import { action } from "@solidjs/router";
import { redirect } from "@solidjs/web";
import { paths } from "./router";

const updateUser = action(async (form: FormData) => {
  await db.users.update(form.get("id"), form);
  throw redirect(paths.users(form.get("id"))); // typed paths work in redirects
});
```

```tsx
<form action={updateUser} method="post">
  <button>Save</button>
</form>

// or
<button type="submit" formaction={updateUser}>Save</button>
```

Actions only work with POST requests, so put `method="post"` on your form. Submitting forms get `aria-busy="true"` automatically while the action (including its revalidation) is in flight — the same CSS story as links:

```css
form[aria-busy] button { pointer-events: none; opacity: 0.6; }
```

Forms work without JavaScript: a real POST, a redirect back, and the result seeded into submission state through a one-shot flash cookie. Single-flight mutations are on by default — the mutation response carries the refreshed route data in the same round trip.

Delegation doesn't require the action's module on the client either. A form bound directly to a server action in a server-only module (a server component) renders a plain `action="/_server?id=...&args=..."` — a self-describing URL. On submit, the router synthesizes the invocation from it: the form data posts to that URL through the server-function transport, `.with()` arguments ride along in the query string, and submissions, `aria-busy`, redirects, revalidation, and single-flight data flow through the normal pipeline. The handler loads lazily on first such submit, so router-only bundles don't carry the data layer. The no-JS POST above remains the fallback only for clients that actually have no JavaScript. (Client-only actions — `action(fn, "name")` without `use server` — are their module's JS by definition and still require it on the client.)

For optimistic UI, attach owner-scoped hooks to the action and use Solid's optimistic primitives for rendered state:

```tsx
import { createOptimisticStore } from "solid-js";
import { action, query } from "@solidjs/router";

const getTodos = query(async () => fetchTodos(), "todos");
const [todos, setTodos] = createOptimisticStore(() => getTodos(), []);

const addTodo = action(async todo => {
  await saveTodo(todo);
  return { ok: true, todo };
}, "add-todo").onSubmit(todo => {
  setTodos(items => {
    items.push({ ...todo, pending: true });
  });
});
```

`onSubmit(...)` registers a listener in the current reactive owner — multiple components can register against the same action, and hooks are removed when their owner is disposed. `onSettled(...)` works the same way for observing completed submissions.

The preferred pattern is returning values and letting the client interpret the result; thrown errors are still captured on `Submission.error` as an escape hatch.

Actions have a `with` method (like `bind`) for typed arguments instead of hidden form fields:

```tsx
const deleteTodo = action(api.deleteTodo);

<form action={deleteTodo.with(todo.id)} method="post">
  <button type="submit">Delete</button>
</form>;
```

Since form actions serialize to string attributes that must match across SSR, actions that aren't server functions need a stable name: `action(fn, "my-action")`.

### `useAction`

Call an action directly instead of through a form — this is how the router context is captured. Outside a form you can pass typed data instead of `FormData`, but this requires client-side JavaScript and is not progressively enhanceable:

```tsx
const submit = useAction(myAction);
submit(...args);
```

### `useSubmissions`

Returns settled submission records for an action — the durable history layer, not in-flight state. Useful for reading completed results, clearing old submissions, retrying, or replaying settled errors:

```tsx
const submissions = useSubmissions(action, input => filter(input));
const latest = submissions.at(-1);
// { input, result?, error, url, clear(), retry() }
```

Use Solid's `createOptimistic` / `createOptimisticStore` for in-flight UI.

## Typed Search Params

Give a route a [Standard Schema](https://github.com/standard-schema/standard-schema) validator (Valibot, Zod, ArkType, hand-rolled…) and its types flow into `paths` and `useSearchParams`:

```tsx
import * as v from "valibot";

const routes = defineRoutes([
  {
    path: "/search",
    component: Search,
    search: v.object({
      q: v.optional(v.string(), ""),
      page: v.optional(v.pipe(v.unknown(), v.transform(Number)), 1)
    })
  }
]);
```

```tsx
const [search, setSearch] = useSearchParams(paths.search);
search.page;                          // number (parsed, not "2")
setSearch({ page: search.page + 1 }); // typed setter

<a href={paths.search({ q: "solid", page: 2 })}>Search</a>; // typed builder
```

Without a schema, `useSearchParams()` behaves as before: raw string values, merge-on-set semantics (`''`, `undefined`, and `null` remove keys), navigation-like updates with auto-scrolling disabled.

## Router Config Reference

```tsx
createRouter(config);
```

| option          | type                       | description                                                                                            |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `routes`        | `RouteDefinition[]`        | The route tree — inline arrays infer literally; wrap extracted trees in `defineRoutes`                   |
| `base`          | `string`                   | Base url to use for matching routes                                                                     |
| `preload`       | `RoutePreloadFunc`         | App-wide preload: once per mount/request, result reaches the root render-prop as `props.data`           |
| `history`       | `RouterHistory`            | History adapter; defaults to browser history on the client and the request URL on the server            |
| `singleFlight`  | `boolean`                  | Single-flight mutations, default `true`                                                                 |
| `actionBase`    | `string`                   | Root url for server actions, default `/_server`                                                         |
| `preloadLinks`  | `boolean`                  | Preload route code/data on link hover and focus, default `true`                                         |
| `explicitLinks` | `boolean`                  | Require the `link` attribute for router handling instead of intercepting all anchors, default `false`   |
| `transformUrl`  | `(url: string) => string`  | Rewrite URLs before matching                                                                            |

The returned instance is the provider component and carries the static surface:

| member    | description                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------ |
| `paths`   | The [typed path proxy](#typed-paths)                                                             |
| `match`   | Pure matching against an arbitrary URL — no rendering or request context; root→leaf, `[]` if none |
| `routes`  | The config tree                                                                                   |
| `config`  | The full config — lets server integrations consume the instance directly                          |

## Router Primitives

Hooks read the live session off router context.

### useParams

Retrieves a reactive, store-like object of the current route's path parameters. Pass a paths node for typing:

```tsx
const params = useParams();            // Params (strings)
const params = useParams(paths.users); // { id: number } — typed via matchFilters
```

### useNavigate

Retrieves a method to navigate. Accepts a string or a typed path node, plus options:

- `resolve` (_boolean_, default `true`): resolve the path against the current route
- `replace` (_boolean_, default `false`): replace the history entry
- `scroll` (_boolean_, default `true`): scroll to top after navigation
- `state` (_any_): pass custom state to `location.state` (serialized with [structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm))

```tsx
const navigate = useNavigate();
navigate(paths.login, { replace: true });
```

For declarative redirects on render (the old `<Navigate>`), call it during component setup or redirect from a preload.

### useLocation

Retrieves the reactive `location` object:

```tsx
const location = useLocation();
const pathname = createMemo(() => parsePath(location.pathname));
```

### useSearchParams

See [Typed Search Params](#typed-search-params). Reads are proxied — access properties to subscribe.

### useIsRouting

A signal indicating whether the router is processing a navigation — useful for pending UI while the next route and its data settle:

```tsx
const isRouting = useIsRouting();
return <div classList={{ "grey-out": isRouting() }}>...</div>;
```

### useMatch

Tests a path *pattern you supply* against the current location; returns a memo of match information or `undefined`. It never consults the route tree — the pattern doesn't have to correspond to a defined route:

```tsx
const match = useMatch(() => "/admin/*rest");
return <Show when={match()}>...</Show>;
```

### useRouteMatches

Returns an accessor of the router's *resolved* matches for the current location — the chain of route definitions producing the current render, outermost first. This is the counterpart to `useMatch`: one reflects the route tree, the other tests a pattern. Useful for reading `info` metadata:

```tsx
const matches = useRouteMatches();
const breadcrumbs = createMemo(() => matches().map(m => m.route.info.breadcrumb));
```

### usePreloadRoute

Returns a function to preload a route manually — the same work link hover/focus triggers automatically. Accepts strings, URLs, and typed path nodes:

```tsx
const preload = usePreloadRoute();
preload(paths.users(2).settings, { preloadData: true });
```

### useLinkState

Reactive `active`/`current`/`pending` state for [custom link components](#links).

### useBeforeLeave

Takes a function called before leaving a route. The blocking machinery is installed lazily on first use, so apps that never call `useBeforeLeave` don't pay for it in their bundle. The handler receives:

- `from` (_Location_): current location (before change)
- `to` (_string | number_): path passed to `navigate`
- `options` (_NavigateOptions_): options passed to `navigate`
- `preventDefault()`: call to block the route change
- `defaultPrevented` (_readonly boolean_): `true` if any previous handler called `preventDefault`
- `retry(force?)`: retry the navigation, e.g. after confirming with the user; pass `true` to skip re-running leave handlers

```tsx
useBeforeLeave((e: BeforeLeaveEventArgs) => {
  if (form.isDirty && !e.defaultPrevented) {
    e.preventDefault();
    setTimeout(() => {
      if (window.confirm("Discard unsaved changes - are you sure?")) {
        e.retry(true);
      }
    }, 100);
  }
});
```

## Other Environments

History adapters are plain imports, so unused ones never enter your bundle:

```tsx
import { createRouter, hashHistory, memoryHistory } from "@solidjs/router";

// hash mode
const Router = createRouter({ routes, history: hashHistory() });

// tests and non-browser environments
const Router = createRouter({ routes, history: memoryHistory("/users/1") });
```

### Environments without Proxy

On runtimes without `Proxy` support (some older smart TVs), the core router still works: typed `paths` are built lazily so they only require `Proxy` if you access them, and `params`/`location.query` can be swapped to a `Proxy`-free implementation through the history adapter's `paramsWrapper`/`queryWrapper` utils:

```tsx
const base = browserHistory();
const history = {
  ...base,
  // wrappers build objects with defined getters instead of a Proxy
  utils: { ...base.utils, paramsWrapper, queryWrapper }
};
const Router = createRouter({ routes, history });
```

On the server the request URL drives rendering automatically. Without a request event (SSG scripts, server-side tests), the configured history adapter provides the location, so `memoryHistory("/page")` renders that page isomorphically.

The instance also matches arbitrary URLs anywhere — server middleware, sitemap generation, tests — with no rendering involved:

```tsx
import { Router } from "./router";

Router.match("/users/2/settings?tab=x");
// [
//   { path: "/users/:id", match: "/users/2", params: { id: "2" } },
//   { path: "/settings", match: "/users/2/settings", params: {} }
// ]
```

## Server Integration

Framework handler wiring lives in `@solidjs/router/server`. Both integrations accept the router instance directly — its routes, base, and preload are the single source of truth:

```tsx
import { createFlightDataCollector, createNoJSHandler } from "@solidjs/router/server";
import { Router } from "./app/router";

const collectFlightData = createFlightDataCollector(Router);
const handleNoJS = createNoJSHandler();
```

`createFlightDataCollector` produces the single-flight hook: after a mutation it reruns the route data the mutation invalidated for the page the client is on (or is redirected to), folding fresh data into the same response. `createNoJSHandler` implements the no-JS form convention: form posts without the client runtime redirect back with the outcome in a one-shot flash cookie that SSR reads into submission state. Both policies previously lived inside SolidStart; the router now owns them, so custom server setups get single-flight mutations and progressive enhancement without a framework.

## Migration from 0.x

This guide maps from the stable 0.x releases (Solid 1). 1.0 removes the component-based API — the `createRouter` factory is the only way to set up the router, and plain `<a>` elements are the only link primitive. 1.0 also targets Solid 2, so the async data patterns change alongside the router API.

### Router components → `createRouter`

```tsx
// 0.x
<Router root={App}>
  <Route path="/users" component={Users} />
  <Route path="/users/:id" component={User} />
</Router>

// 1.0
const Router = createRouter({
  routes: [
    { path: "/users", component: Users },
    { path: "/users/:id", component: User }
  ]
});

<Router>{props => <App {...props} />}</Router>
```

- `<HashRouter>` → `createRouter({ routes, history: hashHistory() })`
- `<MemoryRouter>` / `createMemoryHistory` → `createRouter({ routes, history: memoryHistory("/initial") })`
- `<StaticRouter url>` / `<Router url>` for SSR → automatic from the request URL; without a request event, pass `memoryHistory(url)`
- `root` prop → the render-prop child; `rootPreload` → the factory's `preload` option

### JSX `<Route>` → config objects

Route props map 1:1 onto definition keys (`path`, `component`, `preload`, `matchFilters`, `info`); nesting becomes `children` arrays. Wrap extracted route trees in `defineRoutes` to get typed `paths`. File-based routing generates config.

### `<A>` → plain `<a>`

- `<A href replace noScroll state>` → `<a href replace noscroll state>` (attributes, all lowercase)
- `activeClass` / `inactiveClass` → CSS attribute selectors on `[data-active]` / `[aria-current="page"]`
- `end` → style exact matches with `[aria-current="page"]` instead of `[data-active]`; the root path already only matches exactly
- Route-relative hrefs → typed `paths`; `useResolvedPath` / `useHref` remain for manual resolution
- Custom link components → `useLinkState`

### Removed and renamed

- `<Navigate>` → call `useNavigate()` during component setup, or redirect from a preload
- `useCurrentMatches` → `useRouteMatches` (same behavior)
- `redirect` / `reload` → import from `@solidjs/web`; they're protocol-level and work without the router
- `json(data, init)` → `respond(data, init)` from `@solidjs/web`
- `cache` (deprecated alias) → `query`

### Data APIs (Solid 2)

- `createAsync` / `createAsyncStore` are gone — read `query()` results with Solid 2 primitives: `createMemo`, `createProjection`, `createOptimistic`, `createOptimisticStore`.

```tsx
// 0.x
const user = createAsync(() => getUser(params.id));

// 1.0
const user = createMemo(() => getUser(params.id));
```

- `query()` stays the source of truth for cached reads and invalidation.
- `useSubmission` (singular) is gone, and submissions are now settled history rather than in-flight state. Pending/optimistic UI moves to Solid's optimistic primitives fed by the action's `.onSubmit(...)` hook; read settled results with `useSubmissions()` and select the latest with `.at(-1)`.

```tsx
// 0.x — read in-flight state off the submission
const submitting = useSubmission(addTodo);
<span>{submitting.pending && "Saving..."}</span>;

// 1.0 — optimistic primitives own in-flight state
const [todos, setTodos] = createOptimisticStore(() => getTodos(), []);
const addTodo = action(saveTodo).onSubmit(todo =>
  setTodos(items => {
    items.push({ ...todo, pending: true });
  })
);
```

- Action lifecycle centers on instance methods: `.onSubmit(...)` for owner-scoped optimistic work, `.onSettled(...)` for observing completions. Returned values are the expected result channel; thrown errors land on `Submission.error`.

## SPAs in Deployed Environments

When deploying a client-side-routed application without server-side rendering, you need to handle redirects to your index page so that loading other URLs doesn't return a 404.

On Netlify, create a `_redirects` file:

```sh
/*   /index.html   200
```

On Vercel, add a rewrites section to `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```
