import { createMemo, lazy, Loading } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, query, useIsRouting } from "../../src/index.js";

// Route components are lazy with a moduleUrl, as the Vite plugin's file routes
// are. The server manifest answers for them, so the root <Loading> serializes
// a module map and its hydration waits for the client to preload those
// modules, while the router outside the boundary already takes clicks.
const manifest = {
  "src/routes/home.tsx": { file: "routes/home.js" },
  "src/routes/destination.tsx": { file: "routes/destination.js" }
};

export function createApp() {
  let releaseModules!: () => void;
  const modulesLoaded = isServer
    ? Promise.resolve()
    : new Promise<void>(resolve => (releaseModules = resolve));
  let releaseDestination!: () => void;
  const destinationReady = new Promise<void>(resolve => (releaseDestination = resolve));
  const home = query(async () => "Home ready", "lazy-route-home");
  const destination = query(
    () =>
      isServer
        ? Promise.resolve("Destination ready")
        : destinationReady.then(() => "Destination ready"),
    "lazy-route-destination"
  );
  let isRouting!: ReturnType<typeof useIsRouting>;

  function Home() {
    const data = createMemo(() => home(), { deferStream: true });
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

  const modules: Record<string, { default: () => any }> = {
    "/routes/home.js": { default: Home },
    "/routes/destination.js": { default: Destination }
  };
  const route = (moduleUrl: string, file: string) =>
    lazy(() => modulesLoaded.then(() => modules[file]), undefined, moduleUrl);

  const Router = createRouter({
    routes: [
      { path: "/", component: route("src/routes/home.tsx", "/routes/home.js") },
      {
        path: "/destination",
        component: route("src/routes/destination.tsx", "/routes/destination.js")
      }
    ],
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

  // Stands in for the browser's import() of each serialized module map entry:
  // loadModuleAssets reuses an in-flight `_$HY.loading` entry.
  function preload(hy: any) {
    hy.modules ||= {};
    hy.loading ||= {};
    for (const id in hy.r) {
      if (!id.endsWith("_assets")) continue;
      for (const key in hy.r[id]) {
        const mod = modules[new URL(hy.r[id][key], "http://localhost/").pathname];
        hy.loading[key] = modulesLoaded.then(() => {
          hy.modules[key] = mod;
        });
      }
    }
  }

  return {
    App,
    manifest,
    preload,
    release: () => {},
    releaseModules: () => releaseModules(),
    releaseDestination,
    isRouting: () => isRouting(),
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
