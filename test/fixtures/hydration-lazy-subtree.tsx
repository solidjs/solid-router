import { Loading } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, useIsRouting } from "../../src/index.js";
import type { RouteDefinition } from "../../src/types.js";

// The page's routes are a lazy subtree: the server streams the page once its
// table resolves, the client loads the table again while the page hydrates.
export function createApp() {
  let release!: () => void;
  let releaseTable!: () => void;
  const tableLoaded = new Promise<void>(resolve =>
    isServer ? (release = resolve) : (releaseTable = resolve)
  );
  let isRouting!: ReturnType<typeof useIsRouting>;

  function Home() {
    return (
      <main>
        <h1>Home</h1>
        <a href="/destination">Destination</a>
      </main>
    );
  }

  function Destination() {
    return (
      <main>
        <h1>Destination</h1>
      </main>
    );
  }

  const table: RouteDefinition[] = [
    { path: "/", component: Home },
    { path: "/destination", component: Destination }
  ];
  const Router = createRouter({
    routes: [{ path: "/", children: () => tableLoaded.then(() => ({ default: table })) }],
    scrollRestoration: false
  });

  function App() {
    return (
      <Router>
        {props => {
          isRouting = useIsRouting();
          return <Loading fallback={<main>Loading...</main>}>{props.children}</Loading>;
        }}
      </Router>
    );
  }

  return {
    App,
    release: () => release(),
    releaseTable: () => releaseTable(),
    isRouting: () => isRouting(),
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
