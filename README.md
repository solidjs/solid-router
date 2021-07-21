# Solid App Router

Solid App Router is a universal router for SolidJS that combines paradigms of React Router and Ember Router. Routes can be defined both in the JSX and as a JSON object for file-system based routing and supports Nested Routing.

It supports all Solid's SSR methods and has Solid's Transitions baked in, so use freely with Suspense, Resources, and Lazy components. Solid App Router also allows you to define a Data function that loads in parallel of the Routes to allow automatic fetch-as-you-render that removes client side request waterfalls.

## Getting Started

```sh
> npm i solid-app-router
```

Install then wrap your application with the Router component:

```jsx
import { render } from "solid-js/web";
import { Router } from "solid-app-router";
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

## JSX Based

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Routes, Route, Link } from "solid-app-router";

const Users = lazy(() => import("/pages/users.js"));
const User = lazy(() => import("/pages/users/[id].js"));
const UserHome = lazy(() => import("/pages/users/[id]/index.js"));
const UserSettings = lazy(() => import("/pages/users/[id]/settings.js"));
const UserNotFound = lazy(() => import("/pages/users/[id]/[...all].js"));
const Home = lazy(() => import("/pages/index.js"));
const NotFound = lazy(() => import("/pages/[...all].js"));

function App() {
  const Routes = useRoutes(routes);
  return (
    <>
      <h1>Awesome Site</h1>
      <Link class="nav" href="/">
        Home
      </Link>
      <Link class="nav" href="/users">
        Users
      </Link>
      <Routes>
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<User />}>
          <Route path="/" element={<UserHome />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/*all" element={<UserNotFound />} />
        </Route>
        <Route path="/" element={<Home />} />
        <Route path="/*all" element={<NotFound />} />
      </Routes>
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

## Config Based

Great for filesystem based routing:

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, useRoutes, Link } from "solid-app-router";

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
      <Link class="nav" href="/">
        Home
      </Link>
      <Link class="nav" href="/users">
        Users
      </Link>
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

## Creating Links

Solid App Router provides `<Link>` component to provides links in your application. By default all Routes and Links are relative to the parent that created them.

Solid App Router provides a `<NavLink>` component that applies the `active` class when the current route matches its path.

Solid App Router also has a `<Navigate>` component useful for inlining redirects.

These Components all use `href` to define the path:

```jsx
<>
  <NavLink href="/">Home</NavLink>
  <NavLink href="/about">About</NavLink>
  <NavLink href="/other">Other</NavLink>
</>
```

## Router Primitives

Solid App Router provides a number of primitives that read off the Router and Route context.

### useParams

Retrieves an object containing the route path parameters as defined in the Route.

```js
const params = useParams();

// fetch user based on the id path parameter
const [user] = createResource(() => params.id, fetchUser);
```

### useLocation

Retrieves reactive `location` object useful for getting things like `pathname` or `query`

```js
const location = useLocation();

const createMemo(() => parseQuery(location.query));
```
### useNavigate

Retrieves method to do navigation.

```js
const navigate = useNavigate();

if (unauthorized) {
  navigate("/login", { replace: true });
}
```

### useIsRouting

Retrieves signal that indicates whether the route is currently in a Transition. Useful for showing stale/pending state when the route resolution is Suspended during concurrent rendering.

```js
const isRouting = useIsRouting();

return <div classList={{ "grey-out": isRouting() }}>
  <MyAwesomeConent />
</div>
```

### useData

Retrieves the return value from the data function. You can access parent data by passing a number to indicate ancestor. No argument is the route's own data, `1` is the immediate parent, `2` is the parent's parent, and so on.

```js
const user = useData();

return <h1>{user().name}</h1>;
```

### useMatch

`useMatch` takes an accessor that returns the path and creates a Memo that returns match information if the current path matches the provided path. Useful for determining if a given path matches the current route.

```js
const match = useMatch(() => props.href);

return <div classList={{active: Boolean(match())}} />
```

### useRoutes

Used to define routes via a config object instead of JSX. See `Config Based` above.

## Nested Routing

You can define long paths on your routes and they are handle independently. But with nested Routing we can automatically set up nested layouts. Need to share a header between pages, nest it as children. You can see examples above.

However, while `<Routes>` serve as the entry point for the navigation, for nested routes you need to indicate where the nested route should be inserted. You use the `<Outlet>` component to do that.

```jsx
import { Outlet, useData } from "solid-app-router";

function User() {
  const user = useData();
  return (
    <>
      <h1>{user()?.name}</h1>
      {/* Insert nested Route Here */}
      <Outlet />
    </>
  );
}
```

## Data Functions

Data functions are designed to load in parallel to your lazy loaded routes. They get bundled with your main bundle allowing your page code to be separated and loaded on demand in parallel. You can pass in the `data` prop to your Route definition.

```js
import { lazy } from "solid-js";
import { Route } from "solid-app-router";
import UserData from "./pages/users/[id].data.js";

const User = lazy(() => import("/pages/users/[id].js"));

// In the Route definition
<Route path="/users/:id" element={<User />} data={UserData} />
```

```js
// pages/users/[id].data.js
import { createResource } from "solid-js";

function fetchUser(userId) { /* fetching logic */ }

export default function UserData({ params, location, navigate }) {
  const [user] = createResource(() => params.id, fetchUser);

  return user;
}
```

Data function should create reactive values and return synchronously so that they can be accessed in the case that the route loads before the data does.
