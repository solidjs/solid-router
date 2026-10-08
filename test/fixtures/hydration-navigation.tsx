import { createMemo, Loading } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, query, useIsRouting } from "../../src/index.js";

export function createApp(options: { scrollRestoration?: boolean } = {}) {
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => (release = resolve));
  const home = query(() => (isServer ? pending : Promise.resolve("Home ready")), "hydration-home");
  const destination = query(async () => "Destination ready", "hydration-destination");
  let isRouting!: ReturnType<typeof useIsRouting>;

  function Home() {
    const data = createMemo(() => home());
    return (
      <main>
        <h1>{data()}</h1>
        <a href="/destination">Destination</a>
      </main>
    );
  }

  function Destination() {
    const data = createMemo(() => destination(), { deferStream: true });
    return (
      <main>
        <h1>{data()}</h1>
        <a href="/">Home</a>
      </main>
    );
  }

  const Router = createRouter({
    routes: [
      { path: "/", component: Home },
      { path: "/destination", component: Destination }
    ],
    scrollRestoration: options.scrollRestoration ?? false
  });

  function App() {
    return (
      <Router>
        {props => {
          isRouting = useIsRouting();
          return (
            <Loading
              fallback={
                <main>
                  <h1>Loading...</h1>
                  <a href="/destination">Destination</a>
                </main>
              }
            >
              {props.children}
            </Loading>
          );
        }}
      </Router>
    );
  }

  return {
    App,
    release: () => release("Home ready"),
    isRouting: () => isRouting(),
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
