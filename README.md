# Solid App Router

> Solid 1.0 use 0.0.50 or greater
> Solid 0.x use 0.0.46

Small, config-driven router inspired by Ember Router. While less dynamic than the common React Router approach which I would recommend for most SPAs, this approach is good for file system based routing. For things like you'd find in isomorphic metaframeworks.

So far this is just the basic isomorphic shell. Lots more to do.

```jsx
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route, Link } from "solid-app-router";

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
      { path: "*all", component: lazy(() => import("/pages/users/[id]/[...all].js")) }
    ]
  },
  {
    path: "/",
    component: lazy(() => import("/pages/index.js"))
  },
  {
    path: "*all",
    component: lazy(() => import("/pages/[...all].js"))
  }
];

function App() {
  return (
    <>
      <h1>Awesome Site</h1>
      <Link class="nav" href="/">
        Home
      </Link>
      <Link class="nav" href="/users">
        Users
      </Link>
      {/* route will be inserted here */}
      <Route />
    </>
  );
}

render(
  () => (
    <Router routes={routes}>
      <App />
    </Router>
  ),
  document.getElementById("app")
);
```

TODO: Docs