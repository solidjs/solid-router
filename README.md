# Solid App Router

Small config driven router inspired by Ember Router. While less dynamic than the common React Router approach which I would recommend for most SPAs, this approach is good for file system based routing. For things like you'd find in isomorphic metaframeworks.

So far this is just the basic isomorphic shell. Lot's more to do.

```jsx
import { render } from "solid-js/dom";
import { Router, Route, Link } from "../Router";

const routes = [
  {
    path: "/users",
    component: "/pages/users.js"
  },
  {
    path: "/users/:id",
    component: "/pages/users/[id].js",
    children: [
      { path: "/", component: "/pages/users/[id]/index.js" },
      { path: "/settings", component: "/pages/users/[id]/settings.js" },
      { path: "*all", component: "/pages/users/[id]/[...all].js" }
    ]
  },
  {
    path: "/",
    component: "/pages/index.js"
  },
  {
    path: "*all",
    component: "/pages/[...all].js"
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