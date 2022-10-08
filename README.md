<p>
  <img src="https://assets.solidjs.com/banner?project=Router&type=core" alt="Solid Router" />
</p>

# Solid Router [![npm Version](https://img.shields.io/npm/v/@solidjs/router.svg?style=flat-square)](https://www.npmjs.org/package/@solidjs/router)

A router lets you change your view based on the URL in the browser. This allows your "single-page" application to simulate a traditional multipage site. To use Solid Router, you specify components called Routes that depend on the value of the URL (the "path"), and the router handles the mechanism of swapping them in and out.

Solid Router is a universal router for SolidJS - it works whether you're rendering on the client or on the server. It was inspired by and combines paradigms of React Router and the Ember Router. Routes can be defined directly in your app's template using JSX, but you can also pass your route configuration directly as an object. It also supports nested routing, so navigation can change a part of a component, rather than completely replacing it. 

It supports all of Solid's SSR methods and has Solid's transitions baked in, so use it freely with suspense, resources, and lazy components. Solid Router also allows you to define a data function that loads parallel to the routes ([render-as-you-fetch](https://epicreact.dev/render-as-you-fetch/)).

- [Getting Started](#getting-started)
  - [Set Up the Router](#set-up-the-router)
  - [Configure Your Routes](#configure-your-routes)
- [Create Links to Your Routes](#create-links-to-your-routes)
- [Dynamic Routes](#dynamic-routes)
- [Data Functions](#data-functions)
- [Nested Routes](#nested-routes) 
- [Hash Mode Router](#hash-mode-router) 
- [Config Based Routing](#config-based-routing)
- [Router Primitives](#router-primitives)
  - [useParams](#useparams)
  - [useNavigate](#usenavigate)
  - [useLocation](#uselocation)
  - [useSearchParams](#usesearchparams)
  - [useIsRouting](#useisrouting)
  - [useRouteData](#useroutedata)
  - [useMatch](#usematch)
  - [useRoutes](#useroutes)

## Getting Started

### Set Up the Router

```sh
> npm i @solidjs/router
```

Install `@solidjs/router`, then wrap your root component with the Router component:

```jsx
import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import App from "./App";

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  document.getElementById("app")
);
```

This sets up a context so that we can display the routes anywhere in the app.

### Configure Your Routes

Solid Router allows you to configure your routes using JSX:

1. Use the `Routes` component to specify where the routes should appear in your app.


```jsx
import { Routes, Route } from "@solidjs/router"

export default function App() {
  return <>
    <h1>My Site with Lots of Pages</h1>
    <Routes>

    </Routes>
  </>
}
```

2. Add each route using the `Route` component, specifying a path and an element or component to render when the user navigates to that path.

```jsx
import { Routes, Route } from "@solidjs/router"

import Home from "./pages/Home"
import Users from "./pages/Users"

export default function App() {
  return <>
    <h1>My Site with Lots of Pages</h1>
    <Routes>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
      <Route path="/about" element={<div>This site was made with Solid</div>} />
    </Routes>
  </>
}
```

3. Lazy-load route components

This way, the `Users` and `Home` components will only be loaded if you're navigating to `/users` or `/`, respectively.

```jsx
import { lazy } from "solid-js";
import { Routes, Route } from "@solidjs/router"
const Users = lazy(() => import("./pages/Users"));
const Home = lazy(() => import("./pages/Home"));

export default function App() {
  return <>
    <h1>My Site with Lots of Pages</h1>
    <Routes>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
      <Route path="/about" element={<div>This site was made with Solid</div>} />
    </Routes>
  </>
}
```

## Create Links to Your Routes

Use the `A` component to create an anchor tag that takes you to a route:

```jsx
import { lazy } from "solid-js";
import { Routes, Route, A } from "@solidjs/router"
const Users = lazy(() => import("./pages/Users"));
const Home = lazy(() => import("./pages/Home"));

export default function App() {
  return <>
    <h1>My Site with Lots of Pages</h1>
    <nav>
      <A href="/about">About</A>
      <A href="/">Home</A>
    </nav>
    <Routes>
      <Route path="/users" component={Users} />
      <Route path="/" component={Home} />
      <Route path="/about" element={<div>This site was made with Solid</div>} />
    </Routes>
  </>
}
```

The `<A>` tag also has an `active` class if its href matches the current location, and `inactive` otherwise. **Note:** By default matching includes locations that are descendents (eg. href `/users` matches locations `/users` and `/users/123`), use the boolean `end` prop to prevent matching these. This is particularly useful for links to the root route `/` which would match everything.


| prop     | type    | description                                                                                                                                                                              |
|----------|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| href     | string  | The path of the route to navigate to. This will be resolved relative to the route that the link is in, but you can preface it with `/` to refer back to the root.                                                                                                                                                    |
| noScroll | boolean | If true, turn off the default behavior of scrolling to the top of the new page                                                                                                           |
| replace  | boolean | If true, don't add a new entry to the browser history. (By default, the new page will be added to the browser history, so pressing the back button will take you to the previous route.) |
| state    | unknown | [Push this value](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) to the history stack when navigating  |                                      |
| inactiveClass | string  | The class to show when the link is inactive (when the current location doesn't match the link) |
| activeClass | string | The class to show when the link is active                                                                                                        |
| end  | boolean | If `true`, only considers the link to be active when the curent location matches the `href` exactly; if `false`, check if the current location _starts with_ `href` |

### The Navigate Component
Solid Router provides a `Navigate` component that works similarly to `A`, but it will _immediately_ navigate to the provided path as soon as the component is rendered. It also uses the `href` prop, but you have the additional option of passing a function to `href` that returns a path to navigate to:

```jsx
function getPath ({navigate, location}) {
  //navigate is the result of calling useNavigate(); location is the result of calling useLocation(). 
  //You can use those to dynamically determine a path to navigate to
  return "/some-path";
}

//Navigating to /redirect will redirect you to the result of getPath
<Route path="/redirect" element={<Navigate href={getPath}/>}/>
```

## Dynamic Routes

If you don't know the path ahead of time, you might want to treat part of the path as a flexible parameter that is passed on to the component. 

```jsx
import { lazy } from "solid-js";
import { Routes, Route } from "@solidjs/router"
const Users = lazy(() => import("./pages/Users"));
const User = lazy(() => import("./pages/User"));
const Home = lazy(() => import("./pages/Home"));

export default function App() {
  return <>
    <h1>My Site with Lots of Pages</h1>
    <Routes>
      <Route path="/users" component={Users} />
      <Route path="/users/:id" component={User} />
      <Route path="/" component={Home} />
      <Route path="/about" element={<div>This site was made with Solid</div>} />
    </Routes>
  </>
}
```

The colon indicates that `id` can be any string, and as long as the URL fits that pattern, the `User` component will show.

You can then access that `id` from within a route component with `useParams`:


```jsx
//async fetching function
import { fetchUser } ...

export default function User () {

  const params = useParams();

  const [userData] = createResource(() => params.id, fetchUser);

  return <A href={userData.twitter}>{userData.name}</A>
}
```

### Optional Parameters

Parameters can be specified as optional by adding a question mark to the end of the parameter name:

```jsx
//Matches stories and stories/123 but not stories/123/comments
<Route path='/stories/:id?' element={<Stories/>} />
```

### Wildcard Routes

`:param` lets you match an arbitrary name at that point in the path. You can use `*` to match any end of the path:

```jsx
//Matches any path that begins with foo, including foo/, foo/a/, foo/a/b/c
<Route path='foo/*' component={Foo}/>
```

If you want to expose the wild part of the path to the component as a parameter, you can name it:

```jsx
<Route path='foo/*any' element={<div>{useParams().any}</div>}/>
```

Note that the wildcard token must be the last part of the path; `foo/*any/bar` won't create any routes.

### Multiple Paths

Routes also support defining multiple paths using an array. This allows a route to remain mounted and not rerender when switching between two or more locations that it matches:

```jsx
//Navigating from login to register does not cause the Login component to re-render
<Route path={["login", "register"]} component={Login}/>
```


## Data Functions
In the [above example](#dynamic-routes), the User component is lazy-loaded and then the data is fetched. With route data functions, we can instead start fetching the data parallel to loading the route, so we can use the data as soon as possible.

To do this, create a function that fetches and returns the data using `createResource`. Then pass that function to the `data` prop of the `Route` component. 


```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import { fetchUser } ...

const User = lazy(() => import("./pages/users/[id].js"));

//Data function
function UserData({params, location, navigate, data}) {
  const [user] = createResource(() => params.id, fetchUser);
  return user;
}

//Pass it in the route definition
<Route path="/users/:id" component={User} data={UserData} />;
```

When the route is loaded, the data function is called, and the result can be accessed by calling `useRouteData()` in the route component.

```jsx
//pages/users/[id].js
import { useRouteData } from '@solidjs/router';
export default function User() {
  const user = useRouteData();
  return <h1>{user().name}</h1>;
}
```

As its only argument, the data function is passed an object that you can use to access route information:

| key       | type                                           | description                                                                                                 |
|-----------|------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| params    | object                                         | The route parameters (same value as calling `useParams()` inside the route component)                       |
| location  | `{ pathname, search, hash, query, state, key}` | An object that you can use to get more information about the path (corresponds to [`useLocation()`](#uselocation))          |
| navigate | `(to: string, options?: NavigateOptions) => void`                        | A function that you can call to navigate to a different route instead (corresponds to [`useNavigate()`](#usenavigate))     |
| data      | unknown                                        | The data returned by the [parent's](#nested-routes) data function, if any. (Data will pass through any intermediate nesting.) |

A common pattern is to export the data function that corresponds to a route in a dedicated `route.data.js` file. This way, the data function can be imported without loading anything else.

```js
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import { fetchUser } ... 
import UserData from "./pages/users/[id].data.js";
const User = lazy(() => import("/pages/users/[id].js"));

// In the Route definition
<Route path="/users/:id" component={User} data={UserData} />;
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

//This works
<Route path="/users" component={Users} />
<Route path="/users/:id" component={User} />

//This also works
<Route path="/users">
  <Route path="/" component={Users} />
  <Route path="/:id" component={User} />
</Route>
```

You can also take advantage of nesting by adding a parent element with an `<Outlet/>`.
```jsx

import { Outlet } from "@solidjs/router";

function PageWrapper () {
  return <div>
    <h1> We love our users! </h1>
    <Outlet/>
    <A href="/">Back Home</A>
  </div>
}

<Route path="/users" component={PageWrapper}>
  <Route path="/" component={Users}/>
  <Route path="/:id" component={User} />
</Route>
```
The routes are still configured the same, but now the route elements will appear inside the parent element where the `<Outlet/>` was declared.

You can nest indefinitely - just remember that only leaf nodes will become their own routes. In this example, the only route created is `/layer1/layer2`, and it appears as three nested divs.

```jsx
<Route path='/' element={<div>Onion starts here <Outlet /></div>}>
  <Route path='layer1' element={<div>Another layer <Outlet /></div>}>
    <Route path='layer2' element={<div>Innermost layer</div>}></Route>
  </Route>
</Route>
```

If you declare a `data` function on a parent and a child, the result of the parent's data function will be passed to the child's data function as the `data` property of the argument, as described in the last section. This works even if it isn't a direct child, because by default every route forwards its parent's data. 

## Hash Mode Router

By default, Solid Router uses `location.pathname` as route path. You can simply switch to hash mode through the `source` property on `<Router>` component.

```jsx
import { Router, hashIntegration } from '@solidjs/router'

<Router source={hashIntegration()}><App></Router>
```

## Config Based Routing

You don't have to use JSX to set up your routes; you can pass an object directly with `useRoutes`:

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, useRoutes, A } from "@solidjs/router";

const routes = [
  {
    path: "/users",
    component: lazy(() => import("/pages/users.js"))
  },
  {
    path: "/users/:id",
    component: lazy(() => import("/pages/users/[id].js")),
    children: [
      { path: "/", component: lazy(() => import("/pages/users/[id]/index.js")) },
      { path: "/settings", component: lazy(() => import("/pages/users/[id]/settings.js")) },
      { path: "/*all", component: lazy(() => import("/pages/users/[id]/[...all].js")) }
    ]
  },
  {
    path: "/",
    component: lazy(() => import("/pages/index.js"))
  },
  {
    path: "/*all",
    component: lazy(() => import("/pages/[...all].js"))
  }
];

function App() {
  const Routes = useRoutes(routes);
  return (
    <>
      <h1>Awesome Site</h1>
      <A class="nav" href="/">
        Home
      </A>
      <A class="nav" href="/users">
        Users
      </A>
      <Routes />
    </>
  );
}

render(
  () => (
    <Router>
      <App />
    </Router>
  ),
  document.getElementById("app")
);
```
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

__Note:__ The state is serialized using the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) which does not support all object types.

```js
const navigate = useNavigate();

if (unauthorized) {
  navigate("/login", { replace: true });
}
```

### useLocation

Retrieves reactive `location` object useful for getting things like `pathname`

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
    <button onClick={() => setSearchParams({ page: searchParams.page + 1 })}>Next Page</button>
  </div>
);
```

### useIsRouting

Retrieves signal that indicates whether the route is currently in a Transition. Useful for showing stale/pending state when the route resolution is Suspended during concurrent rendering.

```js
const isRouting = useIsRouting();

return (
  <div classList={{ "grey-out": isRouting() }}>
    <MyAwesomeConent />
  </div>
);
```

### useRouteData

Retrieves the return value from the data function.

> In previous versions you could use numbers to access parent data. This is no longer supported. Instead the data functions themselves receive the parent data that you can expose through the specific nested routes data.

```js
const user = useRouteData();

return <h1>{user().name}</h1>;
```

### useMatch

`useMatch` takes an accessor that returns the path and creates a Memo that returns match information if the current path matches the provided path. Useful for determining if a given path matches the current route.

```js
const match = useMatch(() => props.href);

return <div classList={{ active: Boolean(match()) }} />;
```

### useRoutes

Used to define routes via a config object instead of JSX. See [Config Based Routing](#config-based-routing).
