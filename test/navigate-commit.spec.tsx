/**
 * solidjs/solid#3107: navigation commitment must remain last-write-wins
 * across same-tick calls, microtask interleavings, reentrant pending-state
 * navigation, native traversal, and async-held transitions. History follows
 * only the canonical source write that actually lands.
 */
import { render } from "@solidjs/web";
import { createEffect, createMemo, Loading, untrack } from "solid-js";
import { vi } from "vitest";
import {
  createRouter,
  memoryHistory,
  useIsRouting,
  useNavigate,
  type Navigator,
  type RouteDefinition
} from "../src/index.js";
import { useRouter } from "../src/routing.js";

const settle = async (ms = 5) => {
  await new Promise<void>(resolve => queueMicrotask(resolve));
  await new Promise(resolve => setTimeout(resolve, ms));
};

function mount(routes: any, history: ReturnType<typeof memoryHistory>) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const Router = createRouter({ routes, history });
  const dispose = render(() => <Router />, div);
  return {
    div,
    text: () => div.textContent,
    cleanup: () => {
      dispose();
      div.remove();
    }
  };
}

describe("navigateFromRoute never drops the last navigation", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  const page = (name: string) => () => <div>{name}</div>;

  function threePages(capture: (nav: Navigator) => void) {
    return [
      {
        path: "/",
        component: () => {
          capture(useNavigate());
          return <div>home</div>;
        }
      },
      { path: "/a", component: page("a") },
      { path: "/b", component: page("b") }
    ] as const;
  }

  test("same-tick double navigation commits the second target", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      navigate("/a");
      navigate("/b");
      await settle();
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
    } finally {
      app.cleanup();
    }
  });

  test("same-tick same-value double navigation still commits", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      navigate("/a");
      navigate("/a");
      await settle();
      expect(history.get()).toBe("/a");
      expect(app.text()).toBe("a");
    } finally {
      app.cleanup();
    }
  });

  test("a navigation issued from a microtask racing the commit task wins", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      // registered BEFORE the first navigate, so it runs between the
      // first call's setNavigateTarget and its commit microtask
      queueMicrotask(() => navigate("/b"));
      navigate("/a");
      await settle();
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
    } finally {
      app.cleanup();
    }
  });

  test("a navigation issued after the commit task re-navigates cleanly", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      navigate("/a");
      queueMicrotask(() => navigate("/b"));
      await settle();
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
    } finally {
      app.cleanup();
    }
  });

  test("reentrant navigation from the isRouting flush supersedes and commits", async () => {
    // A pending-state effect can navigate while the first target is held.
    // The second source write must supersede the first transition.
    const history = memoryHistory();
    let navigate!: Navigator;
    let redirected = false;
    let resolveA!: (routes: { default: RouteDefinition[] }) => void;
    const lazyA = new Promise<{ default: RouteDefinition[] }>(resolve => (resolveA = resolve));
    const routes = [
      {
        path: "/",
        component: () => {
          navigate = useNavigate();
          const isRouting = useIsRouting();
          createEffect(
            () => isRouting(),
            routing => {
              if (routing && !redirected) {
                redirected = true;
                untrack(() => navigate("/b", { replace: true }));
              }
            }
          );
          return <div>home</div>;
        }
      },
      {
        path: "/a",
        component: (props: any) => <>{props.children}</>,
        children: () => lazyA
      },
      { path: "/b", component: page("b") }
    ] as const;
    const app = mount(routes, history);
    try {
      await settle();
      navigate("/a");
      await settle();
      expect(redirected).toBe(true);
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
      resolveA({ default: [{ path: "/", component: page("a") }] });
      await settle();
      expect(history.get()).toBe("/b");
    } finally {
      app.cleanup();
    }
  });

  test("superseding a navigation parked on async data still commits the second target", async () => {
    // The flight-consumer shape: a navigation transition held open by
    // unresolved async while another navigation lands. The held fork must
    // not swallow the later commit.
    const history = memoryHistory();
    let navigate!: Navigator;
    let releaseSlow!: () => void;
    const gate = new Promise<void>(resolve => (releaseSlow = resolve));
    const routes = [
      {
        path: "/",
        component: () => {
          navigate = useNavigate();
          return <div>home</div>;
        }
      },
      {
        path: "/slow",
        component: () => {
          const value = createMemo(async () => {
            await gate;
            return "slow";
          });
          return (
            <Loading fallback={<div>loading</div>}>
              <div>{value()}</div>
            </Loading>
          );
        }
      },
      { path: "/b", component: page("b") }
    ] as const;
    const app = mount(routes, history);
    try {
      navigate("/slow");
      await settle();
      navigate("/b");
      await settle();
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
      releaseSlow();
      await settle();
      // the late-resolving fork must not resurrect /slow
      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
    } finally {
      app.cleanup();
    }
  });

  test("superseding redirects commit once with the first navigation's history policy", async () => {
    const history = memoryHistory();
    const set = vi.spyOn(history, "set");
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      navigate("/a", { replace: true, scroll: false });
      navigate("/b", { replace: false, scroll: true });
      await settle();

      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          value: "/b",
          replace: true,
          scroll: false
        })
      );
    } finally {
      app.cleanup();
    }
  });

  test("history waits for a parked lazy route to settle", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    let resolveRoutes!: (routes: { default: RouteDefinition[] }) => void;
    const lazyRoutes = new Promise<{ default: RouteDefinition[] }>(resolve => {
      resolveRoutes = resolve;
    });
    const routes = [
      {
        path: "/",
        component: () => {
          navigate = useNavigate();
          return <div>home</div>;
        }
      },
      {
        path: "/lazy",
        component: (props: any) => <>{props.children}</>,
        children: () => lazyRoutes
      }
    ] as const;
    const app = mount(routes, history);
    try {
      navigate("/lazy");
      await settle();

      expect(history.get()).toBe("/");
      expect(app.text()).toBe("home");

      resolveRoutes({
        default: [{ path: "/", component: page("lazy") }]
      });
      await settle();

      expect(history.get()).toBe("/lazy");
      expect(app.text()).toBe("lazy");
    } finally {
      app.cleanup();
    }
  });

  test("a native traversal supersedes a pending programmatic navigation", async () => {
    const history = memoryHistory();
    history.set({ value: "/a" });
    history.set({ value: "/b" });
    history.back();

    let navigate!: Navigator;
    let releaseSlow!: () => void;
    const gate = new Promise<void>(resolve => (releaseSlow = resolve));
    const routes = [
      {
        path: "/a",
        component: () => {
          navigate = useNavigate();
          return <div>a</div>;
        }
      },
      { path: "/b", component: page("b") },
      {
        path: "/slow",
        component: () => {
          const value = createMemo(async () => {
            await gate;
            return "slow";
          });
          return (
            <Loading fallback={<div>loading</div>}>
              <div>{value()}</div>
            </Loading>
          );
        }
      }
    ] as const;
    const app = mount(routes, history);
    try {
      navigate("/slow");
      history.forward();
      await settle();

      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");

      releaseSlow();
      await settle();

      expect(history.get()).toBe("/b");
      expect(app.text()).toBe("b");
    } finally {
      app.cleanup();
    }
  });

  test("navigation intent is derived from the pending source transition", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    let currentIntent!: () => string | undefined;
    const seen: string[] = [];
    const routes = [
      {
        path: "/",
        component: () => {
          navigate = useNavigate();
          currentIntent = useRouter().intent!;
          return <div>home</div>;
        }
      },
      {
        path: "/slow",
        preload: ({ intent }: any) => seen.push(intent),
        component: () => {
          const value = createMemo(async () => {
            await new Promise(resolve => setTimeout(resolve, 25));
            return "slow";
          });
          return (
            <Loading fallback={<div>loading</div>}>
              <div>{value()}</div>
            </Loading>
          );
        }
      }
    ] as const;
    const app = mount(routes, history);
    try {
      navigate("/slow");
      expect(currentIntent()).toBe("navigate");
      await settle();
      expect(seen).toEqual(["navigate"]);

      await settle(30);
      expect(currentIntent()).toBeUndefined();
      expect(history.get()).toBe("/slow");
    } finally {
      app.cleanup();
    }
  });

  test("native traversals expose native intent while matching", async () => {
    const history = memoryHistory();
    history.set({ value: "/native" });
    history.back();
    const seen: string[] = [];
    const routes = [
      { path: "/", component: page("home") },
      {
        path: "/native",
        preload: ({ intent }: any) => seen.push(intent),
        component: page("native")
      }
    ] as const;
    const app = mount(routes, history);
    try {
      history.forward();
      await settle();
      expect(seen).toEqual(["native"]);
      expect(history.get()).toBe("/native");
      expect(app.text()).toBe("native");
    } finally {
      app.cleanup();
    }
  });

  test("rapid-fire navigation bursts always land on the last target", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      let seed = 0x3107;
      for (let round = 0; round < 200; round++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const target = seed & 1 ? "/a" : "/b";
        navigate("/a");
        queueMicrotask(() => navigate("/b"));
        navigate(target);
        queueMicrotask(() => navigate(target));
        await settle(1);
        expect(history.get()).toBe(target);
      }
    } finally {
      app.cleanup();
    }
  });
});
