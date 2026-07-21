/**
 * Compiler-claimed anchors: plain `<a>` elements compiled by Solid get
 * `aria-current` / `data-active` / `data-pending` from the router with no
 * wrapper component. These specs compile real JSX, so they exercise the full
 * chain — compiler claim emission → runtime claim hook → router consumer.
 */
import { render } from "@solidjs/web";
import { createSignal, createMemo, Loading, Show } from "solid-js";
import { vi } from "vitest";
import { createRouter, memoryHistory } from "../src/index.js";
import type { Navigator } from "../src/index.js";
import { useNavigate } from "../src/index.js";

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

const mount = () => {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
};

describe("compiler-claimed anchors", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  const routes = [
    { path: "/", component: () => <div data-route="home" /> },
    { path: "/about", component: () => <div data-route="about" /> },
    {
      path: "/users/:id",
      component: (props: any) => props.children,
      children: [
        { path: "/", component: () => <div data-route="user" /> },
        { path: "/settings", component: () => <div data-route="settings" /> }
      ]
    }
  ] as const;

  test("carries active/current state at creation and across navigation", async () => {
    const div = mount();
    let navigate!: Navigator;

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => {
            navigate = useNavigate();
            return (
              <nav>
                <a data-testid="home" href="/">
                  Home
                </a>
                <a data-testid="about" href="/about">
                  About
                </a>
                {props.children}
              </nav>
            );
          }}
        </Router>
      ),
      div
    );
    try {
      const home = div.querySelector('[data-testid="home"]')!;
      const about = div.querySelector('[data-testid="about"]')!;

      // correct at creation, before any navigation
      expect(about.hasAttribute("data-active")).toBe(true);
      expect(about.getAttribute("aria-current")).toBe("page");
      expect(home.hasAttribute("data-active")).toBe(false);
      expect(home.hasAttribute("aria-current")).toBe(false);

      navigate("/");
      await settle();

      expect(home.hasAttribute("data-active")).toBe(true);
      expect(home.getAttribute("aria-current")).toBe("page");
      expect(about.hasAttribute("data-active")).toBe(false);
      expect(about.hasAttribute("aria-current")).toBe(false);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("marks prefix matches active but not current", async () => {
    const div = mount();

    const Router = createRouter({ routes, history: memoryHistory("/users/2/settings") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="user" href={Router.paths.users(2)}>
                User
              </a>
              <a data-testid="settings" href={Router.paths.users(2).settings}>
                Settings
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      const user = div.querySelector('[data-testid="user"]')!;
      const settings = div.querySelector('[data-testid="settings"]')!;

      // typed path nodes coerce on the attribute
      expect(user.getAttribute("href")).toBe("/users/2");
      expect(settings.getAttribute("href")).toBe("/users/2/settings");

      expect(user.hasAttribute("data-active")).toBe(true);
      expect(user.hasAttribute("aria-current")).toBe(false);
      expect(settings.hasAttribute("data-active")).toBe(true);
      expect(settings.getAttribute("aria-current")).toBe("page");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("claims late mounts with correct state immediately", async () => {
    const div = mount();
    const [show, setShow] = createSignal(false);

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <Show when={show()}>
                <a data-testid="late" href="/about">
                  About
                </a>
              </Show>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      expect(div.querySelector('[data-testid="late"]')).toBeNull();

      setShow(true);
      await settle();

      const late = div.querySelector('[data-testid="late"]')!;
      expect(late.hasAttribute("data-active")).toBe(true);
      expect(late.getAttribute("aria-current")).toBe("page");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("rechecks when a dynamic href changes", async () => {
    const div = mount();
    const [href, setHref] = createSignal("/");

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="dyn" href={href()}>
                Link
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      const dyn = div.querySelector('[data-testid="dyn"]')!;
      expect(dyn.hasAttribute("data-active")).toBe(false);

      setHref("/about");
      await settle();

      expect(dyn.getAttribute("href")).toBe("/about");
      expect(dyn.hasAttribute("data-active")).toBe(true);
      expect(dyn.getAttribute("aria-current")).toBe("page");

      setHref("/users/2");
      await settle();

      expect(dyn.hasAttribute("data-active")).toBe(false);
      expect(dyn.hasAttribute("aria-current")).toBe(false);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("rechecks anchors under spreads", async () => {
    const div = mount();
    const [props_, setProps] = createSignal<Record<string, string>>({ href: "/" });

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="spread" {...props_()}>
                Link
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      const a = div.querySelector('[data-testid="spread"]')!;
      expect(a.hasAttribute("data-active")).toBe(false);

      setProps({ href: "/about" });
      await settle();

      expect(a.hasAttribute("data-active")).toBe(true);
      expect(a.getAttribute("aria-current")).toBe("page");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("flags the navigation target with data-pending while routing", async () => {
    const div = mount();
    let navigate!: Navigator;

    const SlowAbout = () => {
      const data = createMemo(async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        return "About";
      });
      return <div data-route="about">{data()}</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: () => <div data-route="home" /> },
        { path: "/about", component: SlowAbout }
      ] as const,
      history: memoryHistory()
    });
    const dispose = render(
      () => (
        <Router>
          {props => {
            navigate = useNavigate();
            return (
              <>
                <a data-testid="about" href="/about">
                  About
                </a>
                <Loading fallback={<div data-loading />}>{props.children}</Loading>
              </>
            );
          }}
        </Router>
      ),
      div
    );
    try {
      const about = div.querySelector('[data-testid="about"]')!;
      expect(about.hasAttribute("data-pending")).toBe(false);

      navigate("/about");
      await settle();

      // the slow route holds the transition open: the target link is pending
      // while data-active still reflects the committed (current) location
      expect(about.hasAttribute("data-pending")).toBe(true);
      expect(about.hasAttribute("data-active")).toBe(false);

      await settle(50);

      expect(about.hasAttribute("data-pending")).toBe(false);
      expect(about.hasAttribute("data-active")).toBe(true);
      expect(about.getAttribute("aria-current")).toBe("page");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("leaves external, targeted, and download links alone", async () => {
    const div = mount();

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="external" href="https://example.com/about">
                External
              </a>
              <a data-testid="rel" rel="external" href="/about">
                Rel
              </a>
              <a data-testid="target" target="_blank" href="/about">
                Target
              </a>
              <a data-testid="download" download href="/about">
                Download
              </a>
              <a data-testid="step" aria-current="step" href="https://example.com/wizard">
                Step
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      for (const id of ["external", "rel", "target", "download"]) {
        const a = div.querySelector(`[data-testid="${id}"]`)!;
        expect(a.hasAttribute("data-active")).toBe(false);
        expect(a.hasAttribute("aria-current")).toBe(false);
      }
      // user-authored aria-current on unmanaged anchors is never stripped
      expect(div.querySelector('[data-testid="step"]')!.getAttribute("aria-current")).toBe("step");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("requires the link attribute when explicitLinks is set", async () => {
    const div = mount();

    const Router = createRouter({
      routes,
      history: memoryHistory("/about"),
      explicitLinks: true
    });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="plain" href="/about">
                Plain
              </a>
              <a data-testid="opted" link href="/about">
                Opted
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      expect(div.querySelector('[data-testid="plain"]')!.hasAttribute("data-active")).toBe(false);
      expect(div.querySelector('[data-testid="opted"]')!.hasAttribute("data-active")).toBe(true);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("only manages anchors under the router's base path", async () => {
    const div = mount();

    const Router = createRouter({
      routes: [{ path: "/about", component: () => <div data-route="about" /> }] as const,
      base: "/app",
      history: memoryHistory("/app/about")
    });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="in" href="/app/about">
                In
              </a>
              <a data-testid="out" href="/other/about">
                Out
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      expect(div.querySelector('[data-testid="in"]')!.hasAttribute("data-active")).toBe(true);
      expect(div.querySelector('[data-testid="out"]')!.hasAttribute("data-active")).toBe(false);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("ignores forms and stops claiming after the router unmounts", async () => {
    const div = mount();

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <form data-testid="form" action="/about" />
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    const form = div.querySelector('[data-testid="form"]')!;
    expect(form.hasAttribute("data-active")).toBe(false);
    dispose();
    div.remove();

    // handler unregistered with the router: fresh anchors are untouched
    const div2 = mount();
    const dispose2 = render(() => <a data-testid="after" href="/about" />, div2);
    try {
      expect(div2.querySelector('[data-testid="after"]')!.hasAttribute("data-active")).toBe(false);
    } finally {
      dispose2();
      div2.remove();
    }
  });
});
