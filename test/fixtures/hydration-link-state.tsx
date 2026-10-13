import { createMemo, Loading } from "solid-js";
import { sharedConfig } from "solid-js/internal";
import { isServer } from "@solidjs/web";
import { createRouter, useNavigate } from "../../src/index.js";
import type { Navigator } from "../../src/index.js";

export function createApp() {
  let navigate!: Navigator;
  let release!: () => void;
  const ready = new Promise<void>(resolve => (release = resolve));

  function Late() {
    const label = createMemo(async () => (isServer ? (await ready, "Late") : "Late"));
    return <a href="/about">{label()}</a>;
  }

  function Layout(props: any) {
    navigate = useNavigate();
    return (
      <>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="https://site.example/about">Absolute</a>
          <a href="/about" aria-current="page">
            Authored
          </a>
        </nav>
        <aside>
          <Loading fallback={<span>Loading</span>}>
            <Late />
          </Loading>
        </aside>
        <main>{props.children}</main>
      </>
    );
  }

  const Router = createRouter({
    scrollRestoration: false,
    routes: [
      {
        path: "/",
        component: Layout,
        children: [
          { path: "/", component: () => <h1>Home</h1> },
          { path: "/about", component: () => <h1>About</h1> }
        ]
      }
    ]
  });

  return {
    App: () => <Router />,
    navigate: (to: string) => navigate(to),
    release: () => release(),
    isHydrationInProgress: () => sharedConfig.isHydrationInProgress!()
  };
}
