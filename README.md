# Solid App Router

> Solid 1.0 use 0.0.50 or greater
> Solid 0.x use 0.0.46

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
    element: lazy(() => import("/pages/users.js"))
  },
  {
    path: "/users/:id",
    element: lazy(() => import("/pages/users/[id].js")),
    children: [
      { path: "/", element: lazy(() => import("/pages/users/[id]/index.js")) },
      { path: "/settings", element: lazy(() => import("/pages/users/[id]/settings.js")) },
      { path: "*all", element: lazy(() => import("/pages/users/[id]/[...all].js")) }
    ]
  },
  {
    path: "/",
    element: lazy(() => import("/pages/index.js"))
  },
  {
    path: "*all",
    element: lazy(() => import("/pages/[...all].js"))
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

TODO: Docs