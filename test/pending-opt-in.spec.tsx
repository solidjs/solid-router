/**
 * Pending navigation state is pay-for-use (#655): `data-pending` comes from
 * the `pendingLinks` claims plugin, `useIsRouting` builds its state on first
 * use, and an app that wants the in-flight destination reads it with
 * `latest()` on the location.
 */
import { render } from "@solidjs/web";
import {
  createMemo,
  createRenderEffect,
  flush,
  getOwner,
  isPending,
  latest,
  Loading,
  runWithOwner,
  type Owner,
  type ParentProps
} from "solid-js";
import { vi } from "vitest";
import {
  createRouter,
  pendingLinks,
  useIsRouting,
  useLinkState,
  useLocation,
  useNavigate,
  type LinksPlugin,
  type Navigator
} from "../src/index.js";

const settle = async (ms = 5) => {
  await new Promise<void>(resolve => queueMicrotask(resolve));
  await new Promise(resolve => setTimeout(resolve, ms));
};

const traverse = (go: () => void) =>
  new Promise<void>(resolve => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    go();
  }).then(() => settle());

function setup(options: { links?: LinksPlugin; layout?: (owner: Owner) => void } = {}) {
  const gates = new Map<string, () => void>();
  const Slow = () => {
    const data = createMemo(() => {
      const id = String(gates.size);
      return new Promise<string>(resolve => gates.set(id, () => resolve("slow")));
    });
    return <div data-route="slow">{data()}</div>;
  };
  let navigate!: Navigator;
  let owner!: Owner;
  window.history.pushState(null, "", "/");
  const Router = createRouter({
    routes: [
      { path: "/", component: () => <div data-route="home" /> },
      { path: "/a", component: () => <div data-route="a" /> },
      { path: "/slow", component: Slow }
    ] as const,
    links: options.links,
    scrollRestoration: false
  });
  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(
    () => (
      <Router>
        {(props: ParentProps) => {
          navigate = useNavigate();
          owner = getOwner()!;
          options.layout?.(owner);
          return (
            <>
              <a href="/a">a</a>
              <a href="/slow">slow</a>
              <Loading fallback={<div data-loading />}>{props.children}</Loading>
            </>
          );
        }}
      </Router>
    ),
    div
  );
  const anchor = (href: string) => div.querySelector(`a[href="${href}"]`)!;
  return {
    navigate: (to: string) => navigate(to),
    anchor,
    release: () => [...gates.values()].forEach(r => r()),
    owner: () => owner,
    cleanup() {
      dispose();
      div.remove();
    }
  };
}

/** Logs `data-pending`/`data-active` writes on claimed anchors. */
function spyAttributes() {
  const writes: string[] = [];
  const proto = Element.prototype;
  const { setAttribute, removeAttribute } = proto;
  proto.setAttribute = function (this: Element, name: string, value: string) {
    if (name.startsWith("data-")) writes.push(`${this.getAttribute("href")}:${name}:set`);
    return setAttribute.call(this, name, value);
  };
  proto.removeAttribute = function (this: Element, name: string) {
    if (name.startsWith("data-")) writes.push(`${this.getAttribute("href")}:${name}:remove`);
    return removeAttribute.call(this, name);
  };
  return {
    writes,
    restore() {
      proto.setAttribute = setAttribute;
      proto.removeAttribute = removeAttribute;
    }
  };
}

describe("pay-for-use pending state (#655)", () => {
  test("without pendingLinks, claims never set data-pending; data-active and aria-current still follow", async () => {
    const spy = spyAttributes();
    const app = setup();
    try {
      await settle();
      app.navigate("/slow");
      await settle();
      expect(app.anchor("/slow").hasAttribute("data-pending")).toBe(false);
      expect(app.anchor("/slow").hasAttribute("data-active")).toBe(false);
      app.release();
      await vi.waitFor(() => expect(app.anchor("/slow").hasAttribute("data-active")).toBe(true));
      expect(app.anchor("/slow").getAttribute("aria-current")).toBe("page");
      expect(spy.writes.filter(w => w.includes("data-pending"))).toEqual([]);
    } finally {
      spy.restore();
      app.cleanup();
    }
  });

  test("without pendingLinks, the claims sweep does not re-run when only pending state changes", async () => {
    for (const links of [undefined, pendingLinks]) {
      const app = setup({ links });
      const spy = spyAttributes();
      try {
        await settle();
        spy.writes.length = 0;
        app.navigate("/slow");
        await settle();
        // the committed location has not moved: only the pending state has
        expect(spy.writes.length > 0).toBe(!!links);
        app.release();
        await vi.waitFor(() => expect(app.anchor("/slow").hasAttribute("data-active")).toBe(true));
      } finally {
        spy.restore();
        app.cleanup();
      }
    }
  });

  test("with pendingLinks, data-pending agrees with useLinkState().pending at every flush", async () => {
    const seen: string[] = [];
    let check!: () => void;
    const app = setup({
      links: pendingLinks,
      layout: () => {
        const states = ["/a", "/slow"].map(href => [href, useLinkState(() => href)] as const);
        check = () => {
          for (const [href, state] of states) {
            const attr = app.anchor(href).hasAttribute("data-pending");
            const hook = state.pending();
            if (attr !== hook) seen.push(`disagree ${href}: attr=${attr} hook=${hook}`);
            else if (hook) seen.push(`pending ${href}`);
          }
        };
        createRenderEffect(
          () => states.map(([, s]) => s.pending()),
          () => queueMicrotask(check)
        );
      }
    });
    try {
      await settle();
      app.navigate("/a");
      check();
      flush();
      check();
      await settle();
      app.navigate("/slow");
      check();
      flush();
      check();
      await settle();
      check();
      app.release();
      await settle();
      check();
      await traverse(() => window.history.back());
      check();
      expect(seen.filter(s => s.startsWith("disagree"))).toEqual([]);
      expect(seen).toContain("pending /slow");
    } finally {
      app.cleanup();
    }
  });

  test("useIsRouting first called mid-navigation reads the navigation as pending, then settles", async () => {
    const app = setup();
    try {
      await settle();
      app.navigate("/slow");
      await settle();
      const isRouting = runWithOwner(app.owner(), () => useIsRouting())!;
      const seen: boolean[] = [];
      runWithOwner(app.owner(), () => createRenderEffect(isRouting, v => void seen.push(v)));
      flush();
      expect(isRouting()).toBe(true);
      app.release();
      await vi.waitFor(() => expect(isRouting()).toBe(false));
      expect(seen).toEqual([true, false]);
      // one state per router: a later call shares it
      expect(runWithOwner(app.owner(), () => useIsRouting())).toBe(isRouting);
    } finally {
      app.cleanup();
    }
  });

  test("useIsRouting first called mid back/forward reads the traversal as pending", async () => {
    const app = setup();
    try {
      await settle();
      app.navigate("/slow");
      await settle();
      app.release();
      await settle();
      app.navigate("/a");
      await settle();
      await traverse(() => window.history.back());
      const isRouting = runWithOwner(app.owner(), () => useIsRouting())!;
      expect(isRouting()).toBe(true);
      app.release();
      await vi.waitFor(() => expect(isRouting()).toBe(false));
      expect(window.location.pathname).toBe("/slow");
    } finally {
      app.cleanup();
    }
  });

  test("the README recipe reads the in-flight destination with latest() on the location", async () => {
    let target!: () => string | undefined;
    const effect: (string | undefined)[] = [];
    const app = setup({
      layout: () => {
        const location = useLocation();
        target = () =>
          isPending(() => location.pathname) ? latest(() => location.pathname) : undefined;
        createRenderEffect(target, v => void effect.push(v));
      }
    });
    try {
      await settle();
      expect(target()).toBeUndefined();
      app.navigate("/slow");
      await settle();
      expect(target()).toBe("/slow");
      app.release();
      await settle();
      expect(target()).toBeUndefined();
      app.navigate("/a");
      await settle();
      expect(target()).toBeUndefined();
      // back/forward: the traversal's destination too
      await traverse(() => window.history.back());
      expect(target()).toBe("/slow");
      app.release();
      await settle();
      expect(target()).toBeUndefined();
      // a synchronous navigation is pending within its own flush, as
      // useIsRouting reports it
      expect(effect).toEqual([undefined, "/slow", undefined, "/a", undefined, "/slow", undefined]);
    } finally {
      app.cleanup();
    }
  });
});
