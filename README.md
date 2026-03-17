[![Banner](https://assets.solidjs.com/banner?project=Router&type=core)](https://github.com/solidjs)

<div align="center">

[![Version](https://img.shields.io/npm/v/@solidjs/router.svg?style=for-the-badge&color=blue&logo=npm)](https://npmjs.com/package/@solidjs/router)
[![Downloads](https://img.shields.io/npm/dm/@solidjs/router.svg?style=for-the-badge&color=green&logo=npm)](https://npmjs.com/package/@solidjs/router)
[![Stars](https://img.shields.io/github/stars/solidjs/solid-router?style=for-the-badge&color=yellow&logo=github)](https://github.com/solidjs/solid-router)
[![Discord](https://img.shields.io/discord/722131463138705510?label=join&style=for-the-badge&color=5865F2&logo=discord&logoColor=white)](https://discord.com/invite/solidjs)
[![Reddit](https://img.shields.io/reddit/subreddit-subscribers/solidjs?label=join&style=for-the-badge&color=FF4500&logo=reddit&logoColor=white)](https://reddit.com/r/solidjs)

</div>

**Solid Router** brings fine-grained reactivity to route navigation, enabling your single-page application to become multi-paged without full page reloads. Fully integrated into the SolidJS ecosystem, Solid Router provides declarative syntax with features like universal rendering and parallel data fetching for best performance.

Explore the official [documentation](https://docs.solidjs.com/solid-router) for detailed guides and examples.

## Core Features

- **All Routing Modes**:
  - [History-Based](https://docs.solidjs.com/solid-router/reference/components/router#router) for standard browser navigation
  - [Hash-Based](https://docs.solidjs.com/solid-router/reference/components/hash-router#hashrouter) for navigation based on URL hash
  - [Static Routing](https://docs.solidjs.com/solid-router/rendering-modes/ssr#server-side-rendering) for server-side rendering (_SSR_)
  - [Memory-Based](https://docs.solidjs.com/solid-router/reference/components/memory-router#memoryrouter) for testing in non-browser environments
- **TypeScript**: Full integration for robust, type-safe development
- **Universal Rendering**: Seamless rendering on both client and server environments
- **Declarative**: Define routes as components or as an object
- **Preload Functions**: Parallel data fetching, following the render-as-you-fetch pattern
- **Dynamic Route Parameters**: Flexible URL patterns with parameters, optional segments, and wildcards
- **Data APIs with Caching**: Reactive data fetching with deduplication and revalidation

## Table of contents

- [Getting Started](#getting-started)
  - [Set Up the Router](#set-up-the-router)
  - [Configure Your Routes](#configure-your-routes)
  - [Create Links to Your Routes](#create-links-to-your-routes)
- [Dynamic Routes](#dynamic-routes)
- [Nested Routes](#nested-routes)
- [Hash Mode Router](#hash-mode-router)
- [Memory Mode Router](#memory-mode-router)
- [Data APIs](#data-apis)
- [Config Based Routing](#config-based-routing)
- [Components](#components)
- [Router Primitives](#router-primitives)
  - [useParams](#useparams)
  - [useNavigate](#usenavigate)
  - [useLocation](#uselocation)
  - [useSearchParams](#usesearchparams)
  - [useIsRouting](#useisrouting)
  - [useMatch](#usematch)
  - [useCurrentMatches](#useCurrentMatches)
  - [useBeforeLeave](#usebeforeleave)
- [SPAs in Deployed Environments](#spas-in-deployed-environments)

## Getting Started

### Set Up the Router

```bash
# use preferred package manager
npm add @solidjs/router
```

Install `@solidjs/router`, then start your application by rendering the router component

```jsx
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";

render(() => <Router />, document.getElementById("app"));
```

This sets up a Router that will match on the url to display the desired page

### Configure Your Routes

Solid Router allows you to configure your routes using JSX:

1. Add each route to a `<Router>` using the `Route` component, specifying a path and a component to render when the user navigates to that path.

```jsx
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

import Home from "./pages/Home";
import Users from "./pages/Users";

render(
  () => (
    <Router>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("app")
);
```

2. Provide a root level layout

This will always be there and won't update on page change. It is the ideal place to put top level navigation and Context Providers

```jsx
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

import Home from "./pages/Home";
import Users from "./pages/Users";

const App = (props) => (
  <>
    <h1>My Site with lots of pages</h1>
    {props.children}
  </>
);

render(
  () => (
    <Router root={App}>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("app")
);
```

3. Create a catch-all route (404 page)

We can create catch-all routes for pages not found at any nested level of the router. We use `*` and optionally the name of a parameter to retrieve the rest of the path.

```jsx
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

import Home from "./pages/Home";
import Users from "./pages/Users";
import NotFound from "./pages/404";

const App = (props) => (
  <>
    <h1>My Site with lots of pages</h1>
    {props.children}
  </>
);

render(
  () => (
    <Router root={App}>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
      <Route path="*404" component={NotFound} />
    </Router>
  ),
  document.getElementById("app")
);
```

4. Lazy-load route components

This way, the `Users` and `Home` components will only be loaded if you're navigating to `/users` or `/`, respectively.

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

const Users = lazy(() => import("./pages/Users"));
const Home = lazy(() => import("./pages/Home"));

const App = (props) => (
  <>
    <h1>My Site with lots of pages</h1>
    {props.children}
  </>
);

render(
  () => (
    <Router root={App}>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("app")
);
```

### Create Links to Your Routes

Use an anchor tag that takes you to a route:

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

const Users = lazy(() => import("./pages/Users"));
const Home = lazy(() => import("./pages/Home"));

const App = (props) => (
  <>
    <nav>
      <a href="/about">About</a>
      <a href="/">Home</a>
    </nav>
    <h1>My Site with lots of pages</h1>
    {props.children}
  </>
);

render(
  () => (
    <Router root={App}>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("app")
);
```

## Dynamic Routes

If you don't know the path ahead of time, you might want to treat part of the path as a flexible parameter that is passed on to the component.

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

const Users = lazy(() => import("./pages/Users"));
const User = lazy(() => import("./pages/User"));
const Home = lazy(() => import("./pages/Home"));

render(
  () => (
    <Router>
      <Route path="/users" component={Users} />
      <Route path="/users/:id" component={User} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("app")
);
```

The colon indicates that `id` can be any string, and as long as the URL fits that pattern, the `User` component will show.

You can then access that `id` from within a route component with `useParams`.

**Note on Animation/Transitions**:
Routes that share the same path match will be treated as the same route. If you want to force re-render you can wrap your component in a keyed `<Show>` like:

```jsx
<Show when={params.something} keyed>
  <MyComponent />
</Show>
```

---

Each path parameter can be validated using a `MatchFilter`.
This allows for more complex routing descriptions than just checking the presence of a parameter.

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import type { MatchFilters } from "@solidjs/router";

const User = lazy(() => import("./pages/User"));

const filters: MatchFilters = {
  parent: ["mom", "dad"], // allow enum values
  id: /^\d+$/, // only allow numbers
  withHtmlExtension: (v: string) => v.length > 5 && v.endsWith(".html"), // we want an `*.html` extension
};

render(
  () => (
    <Router>
      <Route
        path="/users/:parent/:id/:withHtmlExtension"
        component={User}
        matchFilters={filters}
      />
    </Router>
  ),
  document.getElementById("app")
);
```

Here, we have added the `matchFilters` prop. This allows us to validate the `parent`, `id` and `withHtmlExtension` parameters against the filters defined in `filters`.
If the validation fails, the route will not match.

So in this example:

- `/users/mom/123/contact.html` would match,
- `/users/dad/123/about.html` would match,
- `/users/aunt/123/contact.html` would not match as `:parent` is not 'mom' or 'dad',
- `/users/mom/me/contact.html` would not match as `:id` is not a number,
- `/users/dad/123/contact` would not match as `:withHtmlExtension` is missing `.html`.

---

### Optional Parameters

Parameters can be specified as optional by adding a question mark to the end of the parameter name:

```jsx
// Matches stories and stories/123 but not stories/123/comments
<Route path="/stories/:id?" component={Stories} />
```

### Wildcard Routes

`:param` lets you match an arbitrary name at that point in the path. You can use `*` to match any end of the path:

```jsx
// Matches any path that begins with foo, including foo/, foo/a/, foo/a/b/c
<Route path="foo/*" component={Foo} />
```

If you want to expose the wild part of the path to the component as a parameter, you can name it:

```jsx
<Route path="foo/*any" component={Foo} />
```

Note that the wildcard token must be the last part of the path; `foo/*any/bar` won't create any routes.

### Multiple Paths

Routes also support defining multiple paths using an array. This allows a route to remain mounted and not rerender when switching between two or more locations that it matches:

```jsx
// Navigating from login to register does not cause the Login component to re-render
<Route path={["login", "register"]} component={Login} />
```

## Nested Routes

The following two route definitions have the same result:

```jsx
<Route path="/users/:id" component={User} />
```

```jsx
<Route path="/users">
  <Route path="/:id" component={User} />
</Route>
```

`/users/:id` renders the `<User/>` component, and `/users/` is an empty route.

Only leaf Route nodes (innermost `Route` components) are given a route. If you want to make the parent its own route, you have to specify it separately:

```jsx
//This won't work the way you'd expect
<Route path="/users" component={Users}>
  <Route path="/:id" component={User} />
</Route>

// This works
<Route path="/users" component={Users} />
<Route path="/users/:id" component={User} />

// This also works
<Route path="/users">
  <Route path="/" component={Users} />
  <Route path="/:id" component={User} />
</Route>
```

You can also take advantage of nesting by using `props.children` passed to the route component.

```jsx
function PageWrapper(props) {
  return (
    <div>
      <h1> We love our users! </h1>
      {props.children}
      <A href="/">Back Home</A>
    </div>
  );
}

<Route path="/users" component={PageWrapper}>
  <Route path="/" component={Users} />
  <Route path="/:id" component={User} />
</Route>;
```

The routes are still configured the same, but now the route elements will appear inside the parent element where the `props.children` was declared.

You can nest indefinitely - just remember that only leaf nodes will become their own routes. In this example, the only route created is `/layer1/layer2`, and it appears as three nested divs.

```jsx
<Route
  path="/"
  component={(props) => <div>Onion starts here {props.children}</div>}
>
  <Route
    path="layer1"
    component={(props) => <div>Another layer {props.children}</div>}
  >
    <Route path="layer2" component={() => <div>Innermost layer</div>} />
  </Route>
</Route>
```

## Preload Functions

Even with smart caches it is possible that we have waterfalls both with view logic and with lazy loaded code. With preload functions, we can instead start fetching the data parallel to loading the route, so we can use the data as soon as possible. The preload function is called when the Route is loaded or eagerly when links are hovered.

As its only argument, the preload function is passed an object that you can use to access route information:

```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";

const User = lazy(() => import("./pages/users/[id].js"));

// preload function
function preloadUser({ params, location }) {
  // do preloading
}

// Pass it in the route definition
<Route path="/users/:id" component={User} preload={preloadUser} />;
```

| key      | type                                           | description                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| params   | object                                         | The route parameters (same value as calling `useParams()` inside the route component)                                                                                                                                                                                                                                                                                       |
| location | `{ pathname, search, hash, query, state, key}` | An object that you can use to get more information about the path (corresponds to [`useLocation()`](#uselocation))                                                                                                                                                                                                                                                          |
| intent   | `"initial", "navigate", "native", "preload"`   | Indicates why this function is being called. <ul><li>"initial" - the route is being initially shown (ie page load)</li><li>"native" - navigate originated from the browser (eg back/forward)</li><li>"navigate" - navigate originated from the router (eg call to navigate or anchor clicked)</li><li>"preload" - not navigating, just preloading (eg link hover)</li></ul> |

A common pattern is to export the preload function and data wrappers that corresponds to a route in a dedicated `route.data.js` file. This way, the data function can be imported without loading anything else.

```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import preloadUser from "./pages/users/[id].data.js";
const User = lazy(() => import("/pages/users/[id].js"));

// In the Route definition
<Route path="/users/:id" component={User} preload={preloadUser} />;
```

The `preload` function's return value is passed to the page component for any intent other than `"preload"`, allowing you to initialize data or alternatively use our new Data APIs:

## Data APIs

Keep in mind that these are entirely optional, but they demonstrate the power of our preload mechanism.

### `query`

To prevent duplicate fetching and to handle refetching triggers, we provide a query API that accepts a function and returns the same function.

```jsx
const getUser = query(async (id) => {
  return (await fetch(`/api/users/${id}`)).json();
}, "users"); // used as the query key + serialized arguments
```

It is expected that the arguments to the query function are serializable.

This query accomplishes the following:

1. It does deduping on the server for the lifetime of the request.
2. It fills a preload cache in the browser which lasts 5 seconds. When a route is preloaded on hover or when preload is called when entering a route it will make sure to dedupe calls.
3. We have a reactive refetch mechanism based on key. So we can tell routes that aren't new to retrigger on action revalidation.
4. It will serve as a back/forward cache for browser navigation up to 5 mins. Any user based navigation or link click bypasses this cache. Revalidation or new fetch updates the cache.

Using it with preload function might look like:

```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import { getUser } from ... // the query function

const User = lazy(() => import("./pages/users/[id].js"));

// preload function
function preloadUser({params, location}) {
  void getUser(params.id)
}

// Pass it in the route definition
<Route path="/users/:id" component={User} preload={preloadUser} />;
```

Inside your page component you:

```jsx
// pages/users/[id].js
import { getUser } from ... // the query function

export default function User(props) {
  const user = createAsync(() => getUser(props.params.id));
  return <h1>{user().name}</h1>;
}
```

Cached function has a few useful methods for getting the key that are useful for invalidation.

```ts
let id = 5;

getUser.key; // returns "users"
getUser.keyFor(id); // returns "users[5]"
```

You can revalidate the query using the `revalidate` method or you can set `revalidate` keys on your response from your actions. If you pass the whole key it will invalidate all the entries for the query (ie "users" in the example above). You can also invalidate a single entry by using `keyFor`.

`query` can be defined anywhere and then used inside your components with:

### `createAsync`

This is light wrapper over `createResource` that aims to serve as stand-in for a future primitive we intend to bring to Solid core in 2.0. It is a simpler async primitive where the function tracks like `createMemo` and it expects a promise back that it turns into a Signal. Reading it before it is ready causes Suspense/Transitions to trigger.

```jsx
const user = createAsync((currentValue) => getUser(params.id));
```

It also preserves `latest` field from `createResource`. Note that it will be removed in the future.

```jsx
const user = createAsync((currentValue) => getUser(params.id));
return <h1>{user.latest.name}</h1>;
```

Using `query` in `createResource` directly won't work properly as the fetcher is not reactive and it won't invalidate properly.

### `createAsyncStore`

Similar to `createAsync` except it uses a deeply reactive store. Perfect for applying fine-grained changes to large model data that updates.
It also supports `latest` field which will be removed in the future.

```jsx
const todos = createAsyncStore(() => getTodos());
```

### `action`

Actions are data mutations that can trigger invalidations and further routing. A list of prebuilt response helpers can be found below.

```jsx
import { action, revalidate, redirect } from "@solidjs/router"

// anywhere
const myAction = action(async (data) => {
  await doMutation(data);
  throw redirect("/", { revalidate: getUser.keyFor(data.id) }); // throw a response to do a redirect
});

// in component
<form action={myAction} method="post" />

//or
<button type="submit" formaction={myAction}></button>
```

Actions only work with post requests, so make sure to put `method="post"` on your form.

Sometimes it might be easier to deal with typed data instead of `FormData` and adding additional hidden fields. For that reason Actions have a with method. That works similar to `bind` which applies the arguments in order.

Picture an action that deletes Todo Item:

```js
const deleteTodo = action(async (formData: FormData) => {
  const id = Number(formData.get("id"))
  await api.deleteTodo(id)
})

<form action={deleteTodo} method="post">
  <input type="hidden" name="id" value={todo.id} />
  <button type="submit">Delete</button>
</form>
```

Instead with `with` you can write this:

```js
const deleteTodo = action(api.deleteTodo)

<form action={deleteTodo.with(todo.id)} method="post">
  <button type="submit">Delete</button>
</form>
```

Actions also take a second argument which can be the name or an option object with `name` and `onComplete`. `name` is used to identify SSR actions that aren't server functions (see note below). `onComplete` allows you to configure behavior when `action`s complete. Keep in mind `onComplete` does not work when JavaScript is disabled.

#### Notes on `<form>` implementation and SSR

This requires stable references as you can only serialize a string as an attribute, and across SSR they'd need to match. The solution is providing a unique name.

```jsx
const myAction = action(async (args) => {}, "my-action");
```

### `useAction`

Instead of forms you can use actions directly by wrapping them in a `useAction` primitive. This is how we get the router context.

```jsx
// in component
const submit = useAction(myAction);
submit(...args);
```

The outside of a form context you can use custom data instead of formData, and these helpers preserve types. However, even when used with server functions (in projects like SolidStart) this requires client side javascript and is not Progressive Enhanceable like forms are.

### `useSubmission`/`useSubmissions`

Are used to injecting the optimistic updates while actions are in flight. They either return a single Submission(latest) or all that match with an optional filter function.

```jsx
type Submission<T, U> = {
  readonly input: T;
  readonly result?: U;
  readonly pending: boolean;
  readonly url: string;
  clear: () => void;
  retry: () => void;
};

const submissions = useSubmissions(action, (input) => filter(input));
const submission = useSubmission(action, (input) => filter(input));
```

### Response Helpers

These are used to communicate router navigations from query/actions, and can include invalidation hints. Generally these are thrown to not interfere the with the types and make it clear that function ends execution at that point.

#### `redirect(path, options)`

Redirects to the next route

```js
const getUser = query(() => {
  const user = await api.getCurrentUser()
  if (!user) throw redirect("/login");
  return user;
})
```

#### `reload(options)`

Reloads the data on the current page

```js
const getTodo = query(async (id: number) => {
  const todo = await fetchTodo(id);
  return todo;
}, "todo");

const updateTodo = action(async (todo: Todo) => {
  await updateTodo(todo.id, todo);
  reload({ revalidate: getTodo.keyFor(todo.id) });
});
```

## Config Based Routing

You don't have to use JSX to set up your routes; you can pass an array of route definitions:

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";

const routes = [
  {
    path: "/users",
    component: lazy(() => import("/pages/users.js")),
  },
  {
    path: "/users/:id",
    component: lazy(() => import("/pages/users/[id].js")),
    children: [
      {
        path: "/",
        component: lazy(() => import("/pages/users/[id]/index.js")),
      },
      {
        path: "/settings",
        component: lazy(() => import("/pages/users/[id]/settings.js")),
      },
      {
        path: "/*all",
        component: lazy(() => import("/pages/users/[id]/[...all].js")),
      },
    ],
  },
  {
    path: "/",
    component: lazy(() => import("/pages/index.js")),
  },
  {
    path: "/*all",
    component: lazy(() => import("/pages/[...all].js")),
  },
];

render(() => <Router>{routes}</Router>, document.getElementById("app"));
```

Also you can pass a single route definition object for a single route:

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";

const route = {
  path: "/",
  component: lazy(() => import("/pages/index.js")),
};

render(() => <Router>{route}</Router>, document.getElementById("app"));
```

## Alternative Routers

### Hash Mode Router

By default, Solid Router uses `location.pathname` as route path. You can simply switch to hash mode through using `<HashRouter>`.

```jsx
import { HashRouter } from "@solidjs/router";

<HashRouter />;
```

### Memory Mode Router

You can also use memory mode router for testing purpose.

```jsx
import { MemoryRouter } from "@solidjs/router";

<MemoryRouter />;
```

### SSR Routing

For SSR you can use the static router directly or the browser Router defaults to it on the server, just pass in the url.

```jsx
import { isServer } from "solid-js/web";
import { Router } from "@solidjs/router";

<Router url={isServer ? req.url : ""} />;
```

## Components

### `<Router>`

This is the main Router component for the browser.

| prop          | type                                                     | description                                                                                                                                                                               |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| children      | `JSX.Element`, `RouteDefinition`, or `RouteDefinition[]` | The route definitions                                                                                                                                                                     |
| root          | Component                                                | Top level layout component                                                                                                                                                                |
| base          | string                                                   | Base url to use for matching routes                                                                                                                                                       |
| actionBase    | string                                                   | Root url for server actions, default: `/_server`                                                                                                                                          |
| preload       | boolean                                                  | Enables/disables preloads globally, default: `true`                                                                                                                                       |
| explicitLinks | boolean                                                  | Disables all anchors being intercepted and instead requires `<A>`. Default: `false`. (To disable interception for a specific link, set `target` to any value, e.g. `<a target="_self">`.) |

### `<A>`

Like the `<a>` tag but supports automatic apply of base path + relative paths and active class styling (requires client side JavaScript).

The `<A>` tag has an `active` class if its href matches the current location, and `inactive` otherwise. **Note:** By default matching includes locations that are descendants (eg. href `/users` matches locations `/users` and `/users/123`), use the boolean `end` prop to prevent matching these. This is particularly useful for links to the root route `/` which would match everything.

| prop          | type    | description                                                                                                                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| href          | string  | The path of the route to navigate to. This will be resolved relative to the route that the link is in, but you can preface it with `/` to refer back to the root.                        |
| noScroll      | boolean | If true, turn off the default behavior of scrolling to the top of the new page                                                                                                           |
| replace       | boolean | If true, don't add a new entry to the browser history. (By default, the new page will be added to the browser history, so pressing the back button will take you to the previous route.) |
| state         | unknown | [Push this value](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) to the history stack when navigating                                                               |
| inactiveClass | string  | The class to show when the link is inactive (when the current location doesn't match the link)                                                                                           |
| activeClass   | string  | The class to show when the link is active                                                                                                                                                |
| end           | boolean | If `true`, only considers the link to be active when the current location matches the `href` exactly; if `false`, check if the current location _starts with_ `href`                     |

### `<Navigate />`

Solid Router provides a `Navigate` component that works similarly to `A`, but it will _immediately_ navigate to the provided path as soon as the component is rendered. It also uses the `href` prop, but you have the additional option of passing a function to `href` that returns a path to navigate to:

```jsx
function getPath({ navigate, location }) {
  // navigate is the result of calling useNavigate(); location is the result of calling useLocation().
  // You can use those to dynamically determine a path to navigate to
  return "/some-path";
}

// Navigating to /redirect will redirect you to the result of getPath
<Route path="/redirect" component={() => <Navigate href={getPath} />} />;
```

### `<Route>`

The Component for defining Routes:

| prop         | type               | description                                                       |
| ------------ | ------------------ | ----------------------------------------------------------------- |
| path         | string             | Path partial for defining the route segment                       |
| component    | `Component`        | Component that will be rendered for the matched segment           |
| matchFilters | `MatchFilters`     | Additional constraints for matching against the route             |
| children     | `JSX.Element`      | Nested `<Route>` definitions                                      |
| preload      | `RoutePreloadFunc` | Function called during preload or when the route is navigated to. |

## Router Primitives

Solid Router provides a number of primitives that read off the Router and Route context.

### useParams

Retrieves a reactive, store-like object containing the current route path parameters as defined in the Route.

```js
const params = useParams();

// fetch user based on the id path parameter
const [user] = createResource(() => params.id, fetchUser);
```

### useNavigate

Retrieves method to do navigation. The method accepts a path to navigate to and an optional object with the following options:

- resolve (_boolean_, default `true`): resolve the path against the current route
- replace (_boolean_, default `false`): replace the history entry
- scroll (_boolean_, default `true`): scroll to top after navigation
- state (_any_, default `undefined`): pass custom state to `location.state`

**Note:** The state is serialized using the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) which does not support all object types.

```js
const navigate = useNavigate();

if (unauthorized) {
  navigate("/login", { replace: true });
}
```

### useLocation

Retrieves reactive `location` object useful for getting things like `pathname`.

```js
const location = useLocation();

const pathname = createMemo(() => parsePath(location.pathname));
```

### useSearchParams

Retrieves a tuple containing a reactive object to read the current location's query parameters and a method to update them. The object is a proxy so you must access properties to subscribe to reactive updates. Note values will be strings and property names will retain their casing.

The setter method accepts an object whose entries will be merged into the current query string. Values `''`, `undefined` and `null` will remove the key from the resulting query string. Updates will behave just like a navigation and the setter accepts the same optional second parameter as `navigate` and auto-scrolling is disabled by default.

```js
const [searchParams, setSearchParams] = useSearchParams();

return (
  <div>
    <span>Page: {searchParams.page}</span>
    <button
      onClick={() =>
        setSearchParams({ page: (parseInt(searchParams.page) || 0) + 1 })
      }
    >
      Next Page
    </button>
  </div>
);
```

### useIsRouting

Retrieves signal that indicates whether the route is currently in a Transition. Useful for showing stale/pending state when the route resolution is Suspended during concurrent rendering.

```js
const isRouting = useIsRouting();

return (
  <div classList={{ "grey-out": isRouting() }}>
    <MyAwesomeContent />
  </div>
);
```

### useMatch

`useMatch` takes an accessor that returns the path and creates a Memo that returns match information if the current path matches the provided path. Useful for determining if a given path matches the current route.

```js
const match = useMatch(() => props.href);

return <div classList={{ active: Boolean(match()) }} />;
```

### useCurrentMatches

`useCurrentMatches` returns all the matches for the current matched route. Useful for getting all the route information.

For example if you stored breadcrumbs on your route definition you could retrieve them like so:

```js
const matches = useCurrentMatches();

const breadcrumbs = createMemo(() =>
  matches().map((m) => m.route.info.breadcrumb)
);
```

### usePreloadRoute

`usePreloadRoute` returns a function that can be used to preload a route manual. This is what happens automatically with link hovering and similar focus based behavior, but it is available here as an API.

```js
const preload = usePreloadRoute();

preload(`/users/settings`, { preloadData: true });
```

### useBeforeLeave

`useBeforeLeave` takes a function that will be called prior to leaving a route. The function will be called with:

- from (_Location_): current location (before change).
- to (_string | number_): path passed to `navigate`.
- options (_NavigateOptions_): options passed to `navigate`.
- preventDefault (_function_): call to block the route change.
- defaultPrevented (_readonly boolean_): `true` if any previously called leave handlers called `preventDefault`.
- retry (_function_, _force?: boolean_ ): call to retry the same navigation, perhaps after confirming with the user. Pass `true` to skip running the leave handlers again (i.e. force navigate without confirming).

Example usage:

```js
useBeforeLeave((e: BeforeLeaveEventArgs) => {
  if (form.isDirty && !e.defaultPrevented) {
    // preventDefault to block immediately and prompt user async
    e.preventDefault();
    setTimeout(() => {
      if (window.confirm("Discard unsaved changes - are you sure?")) {
        // user wants to proceed anyway so retry with force=true
        e.retry(true);
      }
    }, 100);
  }
});
```

## Migrations from 0.9.x

v0.10.0 brings some big changes to support the future of routing including Islands/Partial Hydration hybrid solutions. Most notably there is no Context API available in non-hydrating parts of the application.

The biggest changes are around removed APIs that need to be replaced.

### `<Outlet>`, `<Routes>`, `useRoutes`

This is no longer used and instead will use `props.children` passed from into the page components for outlets. This keeps the outlet directly passed from its page and avoids oddness of trying to use context across Islands boundaries. Nested `<Routes>` components inherently cause waterfalls and are `<Outlets>` themselves so they have the same concerns.

Keep in mind no `<Routes>` means the `<Router>` API is different. The `<Router>` acts as the `<Routes>` component and its children can only be `<Route>` components. Your top-level layout should go in the root prop of the router [as shown above](#configure-your-routes)

## `element` prop removed from `Route`

Related without Outlet component it has to be passed in manually. At which point the `element` prop has less value. Removing the second way to define route components to reduce confusion and edge cases.

### `data` functions & `useRouteData`

These have been replaced by a preload mechanism. This allows link hover preloads (as the preload function can be run as much as wanted without worry about reactivity). It support deduping/query APIs which give more control over how things are cached. It also addresses TS issues with getting the right types in the Component without `typeof` checks.

That being said you can reproduce the old pattern largely by turning off preloads at the router level and then injecting your own Context:

```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";

const User = lazy(() => import("./pages/users/[id].js"));

// preload function
function preloadUser({ params, location }) {
  const [user] = createResource(() => params.id, fetchUser);
  return user;
}

// Pass it in the route definition
<Router preload={false}>
  <Route path="/users/:id" component={User} preload={preloadUser} />
</Router>;
```

And then in your component taking the page props and putting them in a Context.

```js
function User(props) {
  <UserContext.Provider value={props.data}>
    {/* my component content  */}
  </UserContext.Provider>;
}

// Somewhere else
function UserDetails() {
  const user = useContext(UserContext);
  // render stuff
}
```

## SPAs in Deployed Environments

When deploying applications that use a client side router that does not rely on Server Side Rendering you need to handle redirects to your index page so that loading from other URLs does not cause your CDN or Hosting to return not found for pages that aren't actually there.

Each provider has a different way of doing this. For example on Netlify you create a `_redirects` file that contains:

```sh
/*   /index.html   200
```

On Vercel you add a rewrites section to your `vercel.json`:

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
