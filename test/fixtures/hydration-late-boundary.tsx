import { createMemo, isHydrating, Loading, Show } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, query, useIsRouting } from "../../src/index.js";

// Captured before hydration can swap the global for a tracking run.
const NativePromise = Promise;
const tracing = () => Promise !== NativePromise;

export function createApp(options: { asyncUser?: boolean } = {}) {
  const log: { key: string; tracing: boolean; hydrating: boolean }[] = [];
  const record = (key: string) => log.push({ key, tracing: tracing(), hydrating: !!isHydrating() });
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => (release = resolve));
  const slow = query(() => (isServer ? pending : Promise.resolve("Slow ready")), "late-slow");
  // On the client: a plain fetch chain, or the shape of a server function's
  // client stub (async all the way down).
  const user = query(
    isServer
      ? () => Promise.resolve("User ready")
      : options.asyncUser
        ? async () => {
            record("user");
            const response = await fetch("http://localhost/api/user");
            return response.text();
          }
        : () => {
            record("user");
            return fetch("http://localhost/api/user").then(response => response.text());
          },
    "late-user"
  );
  let isRouting!: ReturnType<typeof useIsRouting>;

  function UserBadge() {
    const name = createMemo(() => (record("badge"), user()));
    return <p id="user">{name()}</p>;
  }

  function Home() {
    const status = createMemo(() => slow());
    return (
      <main>
        <h1>{status()}</h1>
        <Show when={status()}>
          <UserBadge />
        </Show>
      </main>
    );
  }

  function Other() {
    const name = createMemo(() => user());
    return (
      <main>
        <h1>Other: {name()}</h1>
      </main>
    );
  }

  const Router = createRouter({
    routes: [
      { path: "/", component: Home },
      { path: "/other", component: Other }
    ],
    // App-wide data warmed through the root preload. Its memo is async on the
    // server, so hydration adopts the entry inside that memo's tracking run.
    preload: () => user(),
    scrollRestoration: false
  });

  function App() {
    return (
      <Router>
        {props => {
          isRouting = useIsRouting();
          return (
            <>
              <nav>
                <a id="home" href="/">
                  Home
                </a>
                <a id="other" href="/other">
                  Other
                </a>
              </nav>
              <Loading fallback={<h1>Loading...</h1>}>{props.children}</Loading>
            </>
          );
        }}
      </Router>
    );
  }

  return {
    App,
    log,
    release: () => release("Slow ready"),
    isRouting: () => isRouting(),
    isHydrating: () => !!isHydrating(),
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
