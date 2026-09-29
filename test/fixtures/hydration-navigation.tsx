import { createMemo, Loading, sharedConfig } from "solid-js";
import { isServer } from "@solidjs/web";
import { createRouter, query, useNavigate, useSearchParams } from "../../src/index.js";

export function createApp() {
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => (release = resolve));
  const home = query(() => (isServer ? pending : Promise.resolve("Home ready")), "hydration-home");
  const destination = query(async () => "Destination ready", "hydration-destination");
  let controls!: {
    navigate: ReturnType<typeof useNavigate>;
    setSearch: ReturnType<typeof useSearchParams>[1];
  };

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
    scrollRestoration: false
  });

  function App() {
    return (
      <Router>
        {props => {
          controls = { navigate: useNavigate(), setSearch: useSearchParams()[1] };
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

  return { App, release: () => release("Home ready"), controls: () => controls, sharedConfig };
}
