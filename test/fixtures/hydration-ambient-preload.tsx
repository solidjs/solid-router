import { createMemo, Loading } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, eagerPreload, query } from "../../src/index.js";
import type { RouteDefinition } from "../../src/types.js";

// Home streams in behind a boundary and links into a lazy subtree the server
// never loads for "/". With `preload`, the client preloads the link once the
// page has loaded, so the subtree's table lands under the hydrated page.
export function createApp(options: { preload?: boolean } = {}) {
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => (release = resolve));
  const home = query(() => (isServer ? pending : Promise.resolve("Home ready")), "ambient-home");
  let tableLoads = 0;
  let destinationPreloads = 0;

  function Home() {
    const data = createMemo(() => home());
    return (
      <main>
        <h1>{data()}</h1>
        <a href="/section/destination">Destination</a>
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
    { path: "/destination", component: Destination, preload: () => void destinationPreloads++ }
  ];
  const Router = createRouter({
    routes: [
      { path: "/", component: Home },
      { path: "/section", children: () => (tableLoads++, Promise.resolve({ default: table })) }
    ],
    scrollRestoration: false,
    preloadLinks: options.preload ? eagerPreload({ all: true, data: true }) : undefined
  });

  function App() {
    return (
      <Router>
        {props => (
          <Loading
            fallback={
              <main>
                <h1>Loading...</h1>
              </main>
            }
          >
            {props.children}
          </Loading>
        )}
      </Router>
    );
  }

  return {
    App,
    release: () => release("Home ready"),
    tableLoads: () => tableLoads,
    destinationPreloads: () => destinationPreloads,
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
