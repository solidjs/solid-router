# Solid App Router
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

TODO: Docs