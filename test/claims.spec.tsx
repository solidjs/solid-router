/**
 * Compiler-claimed anchors: plain `<a>` elements compiled by Solid get
 * `aria-current` / `data-active` / `data-pending` from the router with no
 * wrapper component. These specs compile real JSX, so they exercise the full
 * chain — compiler claim emission → runtime claim hook → router consumer.
 */
import { claimElement, render } from "@solidjs/web";
import {
  createRoot,
  createSignal,
  createMemo,
  getNextChildId,
  getOwner,
  Loading,
  Show
} from "solid-js";
import { vi } from "vitest";
import { setupLinkClaims } from "../src/claims.js";
import { createRouter, memoryHistory } from "../src/index.js";
import type { LinkState, Navigator } from "../src/index.js";
import { useLinkState, useNavigate } from "../src/index.js";
import type { RouterContext } from "../src/types.js";

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

  test("reasserts state a re-claim finds stripped", async () => {
    // A server-component morph makes attributes match server output exactly,
    // removing what the consumer applied, then re-claims the element.
    const div = mount();

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => (
            <>
              <a data-testid="about" href="/about">
                About
              </a>
              {props.children}
            </>
          )}
        </Router>
      ),
      div
    );
    try {
      const about = div.querySelector('[data-testid="about"]')!;
      expect(about.getAttribute("aria-current")).toBe("page");

      about.removeAttribute("aria-current");
      about.removeAttribute("data-active");
      claimElement(about);

      expect(about.getAttribute("aria-current")).toBe("page");
      expect(about.hasAttribute("data-active")).toBe(true);
    } finally {
      dispose();
      div.remove();
    }
  });

  test("matches the query for aria-current, the pathname for data-active", async () => {
    const div = mount();
    let navigate!: Navigator;

    const Router = createRouter({ routes, history: memoryHistory("/?filter=active") });
    const dispose = render(
      () => (
        <Router>
          {props => {
            navigate = useNavigate();
            return (
              <>
                <a data-testid="all" href="/">
                  All
                </a>
                <a data-testid="active" href="/?filter=active">
                  Active
                </a>
                <a data-testid="completed" href="/?filter=completed">
                  Completed
                </a>
                <a data-testid="reordered" href="/?b=2&a=1">
                  Reordered
                </a>
                {props.children}
              </>
            );
          }}
        </Router>
      ),
      div
    );
    try {
      const get = (id: string) => div.querySelector(`[data-testid="${id}"]`)!;
      const current = () =>
        ["all", "active", "completed", "reordered"].filter(id =>
          get(id).hasAttribute("aria-current")
        );

      expect(current()).toEqual(["active"]);
      for (const id of ["all", "active", "completed", "reordered"])
        expect(get(id).hasAttribute("data-active")).toBe(true);

      // a query-only navigation moves aria-current
      navigate("/?filter=completed");
      await settle();
      expect(current()).toEqual(["completed"]);

      navigate("/");
      await settle();
      expect(current()).toEqual(["all"]);

      // parameter order does not matter
      navigate("/?a=1&b=2");
      await settle();
      expect(current()).toEqual(["reordered"]);
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

  test("setup does not consume a hydration child id", () => {
    // setupLinkClaims runs in the router's client-only branch, so the server
    // never allocates an id for it. If its sweep effect consumed a child id
    // during hydration, every subsequent id would shift by one slot relative
    // to the server — lazy-route lookups miss and server nodes go unclaimed.
    createRoot(
      dispose => {
        const owner = getOwner()!;
        const router = {
          base: { path: () => "" },
          location: { pathname: "/" },
          isRouting: () => false,
          pendingTarget: undefined
        } as unknown as RouterContext;
        setupLinkClaims(router);
        // the first id allocated after setup must match what the server
        // (which never runs setupLinkClaims) hands the owner's first child
        expect(getNextChildId(owner)).toBe("r0");
        dispose();
      },
      { id: "r" }
    );
  });

  test("leaves an authored aria-current alone across navigation and morphs", async () => {
    const div = mount();
    let navigate!: Navigator;

    const Router = createRouter({ routes, history: memoryHistory("/about") });
    const dispose = render(
      () => (
        <Router>
          {props => {
            navigate = useNavigate();
            return (
              <>
                <a data-testid="step" aria-current="step" href="/about">
                  Step
                </a>
                <a data-testid="page" aria-current="page" href="/">
                  Page
                </a>
                {props.children}
              </>
            );
          }}
        </Router>
      ),
      div
    );
    try {
      const step = div.querySelector('[data-testid="step"]')!;
      const page = div.querySelector('[data-testid="page"]')!;
      // current, but the authored value is not overwritten
      expect(step.getAttribute("aria-current")).toBe("step");
      expect(step.hasAttribute("data-active")).toBe(true);
      // not current, but an authored "page" is not the router's to remove
      expect(page.getAttribute("aria-current")).toBe("page");

      navigate("/");
      await settle();
      expect(step.getAttribute("aria-current")).toBe("step");
      expect(page.getAttribute("aria-current")).toBe("page");

      navigate("/about");
      await settle();
      expect(step.getAttribute("aria-current")).toBe("step");

      // a morph restores the server HTML (authored value included, link
      // state stripped) and re-claims
      step.setAttribute("aria-current", "step");
      step.removeAttribute("data-active");
      claimElement(step);
      expect(step.getAttribute("aria-current")).toBe("step");
      expect(step.hasAttribute("data-active")).toBe(true);

      navigate("/");
      await settle();
      expect(step.getAttribute("aria-current")).toBe("step");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("gives up aria-current it owned once the author writes a value", async () => {
    const div = mount();
    let navigate!: Navigator;

    const Router = createRouter({ routes, history: memoryHistory("/about") });
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
                {props.children}
              </>
            );
          }}
        </Router>
      ),
      div
    );
    try {
      const about = div.querySelector('[data-testid="about"]')!;
      expect(about.getAttribute("aria-current")).toBe("page");

      about.setAttribute("aria-current", "step");

      navigate("/");
      await settle();
      expect(about.getAttribute("aria-current")).toBe("step");

      navigate("/about");
      await settle();
      expect(about.getAttribute("aria-current")).toBe("step");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("reasserts its own aria-current through morphs and navigation", async () => {
    const div = mount();
    let navigate!: Navigator;

    const Router = createRouter({ routes, history: memoryHistory("/about") });
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
                {props.children}
              </>
            );
          }}
        </Router>
      ),
      div
    );
    // server HTML never carries link state: a morph strips it all and re-claims
    const morph = (a: Element) => {
      a.removeAttribute("aria-current");
      a.removeAttribute("data-active");
      claimElement(a);
    };
    try {
      const about = div.querySelector('[data-testid="about"]')!;
      morph(about);
      expect(about.getAttribute("aria-current")).toBe("page");

      navigate("/");
      await settle();
      expect(about.hasAttribute("aria-current")).toBe(false);
      morph(about);
      expect(about.hasAttribute("aria-current")).toBe(false);
      expect(about.hasAttribute("data-active")).toBe(false);

      navigate("/about");
      await settle();
      expect(about.getAttribute("aria-current")).toBe("page");
      morph(about);
      expect(about.getAttribute("aria-current")).toBe("page");
      expect(about.hasAttribute("data-active")).toBe(true);
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

/**
 * Claimed anchors and `useLinkState` share one matching rule. Every scenario
 * runs through both so they cannot drift: `current` is pathname + query
 * (order and hash aside), `active` is pathname-only with the root exact.
 * Anchors have no `end`, so `end` links run through `useLinkState` only.
 */
describe("link state parity: claimed anchors and useLinkState", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  type Link = { href: string; end?: boolean; active: boolean; current: boolean };
  // `href` and `location` are full URL paths; under a `base`, useLinkState
  // and navigate get the base-relative path, as an app would write them
  type Scenario = { name: string; base?: string; location: string; links: Link[] };
  const scenarios: Scenario[] = [
    {
      name: "filter links: only the matching query is current, all are active",
      location: "/?filter=active",
      links: [
        { href: "/", active: true, current: false },
        { href: "/?filter=active", active: true, current: true },
        { href: "/?filter=completed", active: true, current: false }
      ]
    },
    {
      name: "parameter order does not matter",
      location: "/products?b=2&a=1",
      links: [
        { href: "/products?a=1&b=2", active: true, current: true },
        { href: "/products?a=1", active: true, current: false }
      ]
    },
    {
      name: "a nav link is active but not current under a query",
      location: "/products?page=2",
      links: [
        { href: "/products", active: true, current: false },
        { href: "/products?page=2#reviews", active: true, current: true }
      ]
    },
    {
      name: "the root link is exact-only",
      location: "/about",
      links: [
        { href: "/", active: false, current: false },
        { href: "/about", active: true, current: true }
      ]
    },
    {
      name: "the root link on the root",
      location: "/",
      links: [
        { href: "/", active: true, current: true },
        { href: "/about", active: false, current: false }
      ]
    },
    {
      name: "end makes active exact-path",
      location: "/products/42",
      links: [
        { href: "/products", active: true, current: false },
        { href: "/products", end: true, active: false, current: false },
        { href: "/products/42", end: true, active: true, current: true }
      ]
    },
    {
      name: "a non-ASCII link matches the encoded location",
      location: "/café",
      links: [
        { href: "/café", active: true, current: true },
        { href: "/caf%C3%A9", active: true, current: true },
        { href: "/café/menu", active: false, current: false }
      ]
    },
    {
      name: "a non-ASCII link is active on its children",
      location: "/café/menu",
      links: [
        { href: "/café", active: true, current: false },
        { href: "/caf%C3%A9", active: true, current: false },
        { href: "/café/menu", active: true, current: true }
      ]
    },
    {
      name: "an encoded slash is not a path separator",
      location: "/a%2Fb",
      links: [
        { href: "/a", active: false, current: false },
        { href: "/a/b", active: false, current: false },
        { href: "/a%2Fb", active: true, current: true }
      ]
    },
    {
      name: "a link with an encoded slash only matches its own path",
      location: "/a/b",
      links: [
        { href: "/a", active: true, current: false },
        { href: "/a/b", active: true, current: true },
        { href: "/a%2Fb", active: false, current: false }
      ]
    },
    {
      name: "a stray percent sign is compared, not decoded",
      location: "/100%",
      links: [{ href: "/100%", active: true, current: true }]
    },
    {
      name: "the base root link on the base root",
      base: "/app",
      location: "/app",
      links: [
        { href: "/app", active: true, current: true },
        { href: "/app/", active: true, current: true },
        { href: "/app/about", active: false, current: false }
      ]
    },
    {
      name: "the base root link is exact-only",
      base: "/app",
      location: "/app/about",
      links: [
        { href: "/app", active: false, current: false },
        { href: "/app/", active: false, current: false },
        { href: "/app/about", active: true, current: true }
      ]
    },
    {
      name: "links under the base match by prefix",
      base: "/app",
      location: "/app/about/team",
      links: [
        { href: "/app", active: false, current: false },
        { href: "/app/about", active: true, current: false }
      ]
    }
  ];

  const key = (link: Link) => `${link.href}|${link.end ? "end" : ""}`;
  const relative = (base: string, path: string) => path.slice(base.length) || "/";
  const bases = [...new Set(scenarios.map(s => s.base ?? ""))];
  const scenariosUnder = (base: string) => scenarios.filter(s => (s.base ?? "") === base);

  const mountAll = (location: string, base = "") => {
    const allLinks = scenariosUnder(base).flatMap(s => s.links);
    const uniqueLinks = [...new Map(allLinks.map(link => [key(link), link])).values()];
    const div = mount();
    let navigate!: Navigator;
    const states = new Map<string, LinkState>();
    const Router = createRouter({
      routes: [{ path: "*all", component: () => <div data-route="page" /> }] as const,
      ...(base ? { base } : {}),
      history: memoryHistory(location)
    });
    const dispose = render(
      () => (
        <Router>
          {props => {
            navigate = useNavigate();
            for (const link of uniqueLinks)
              states.set(
                key(link),
                useLinkState(() => relative(base, link.href), { end: link.end })
              );
            return (
              <>
                {uniqueLinks
                  .filter(link => !link.end)
                  .map(link => (
                    <a data-key={key(link)} href={link.href} />
                  ))}
                {props.children}
              </>
            );
          }}
        </Router>
      ),
      div
    );
    const check = (scenario: Scenario) => {
      for (const link of scenario.links) {
        // the label rides along so a failure names the link and location
        const expected = (via: string) => ({
          via: `${via} ${key(link)} on ${scenario.location}`,
          active: link.active,
          current: link.current
        });
        const state = states.get(key(link))!;
        expect({
          via: `useLinkState ${key(link)} on ${scenario.location}`,
          active: state.active(),
          current: state.current()
        }).toEqual(expected("useLinkState"));
        if (link.end) continue;
        const a = div.querySelector(`[data-key="${key(link)}"]`)!;
        expect({
          via: `anchor ${key(link)} on ${scenario.location}`,
          active: a.hasAttribute("data-active"),
          current: a.getAttribute("aria-current") === "page"
        }).toEqual(expected("anchor"));
      }
    };
    return {
      check,
      navigate: (to: string) => navigate(relative(base, to)),
      cleanup: () => {
        dispose();
        div.remove();
      }
    };
  };

  test.each(scenarios)("$name (at creation)", scenario => {
    const { check, cleanup } = mountAll(scenario.location, scenario.base);
    try {
      check(scenario);
    } finally {
      cleanup();
    }
  });

  test.each(bases.filter(Boolean))("every scenario under base %s after navigating", async base => {
    const { check, navigate, cleanup } = mountAll(base + "/elsewhere", base);
    try {
      const under = scenariosUnder(base);
      for (const scenario of [...under, ...under.slice(0, 1)]) {
        navigate(scenario.location);
        await settle();
        check(scenario);
      }
    } finally {
      cleanup();
    }
  });

  test("every scenario after navigating, query-only changes included", async () => {
    const { check, navigate, cleanup } = mountAll("/elsewhere");
    try {
      const under = scenariosUnder("");
      for (const scenario of [...under, ...under.slice(0, 1)]) {
        navigate(scenario.location);
        await settle();
        check(scenario);
      }
      // query-only moves between the filter links
      navigate("/?filter=completed");
      await settle();
      check({
        name: "",
        location: "/?filter=completed",
        links: [
          { href: "/", active: true, current: false },
          { href: "/?filter=active", active: true, current: false },
          { href: "/?filter=completed", active: true, current: true }
        ]
      });
    } finally {
      cleanup();
    }
  });
});
