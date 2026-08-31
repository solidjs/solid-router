/**
 * solidjs/solid#3107: navigateFromRoute commits the URL from a cancelable
 * queueMicrotask guarded by `lastTransitionTarget` identity. The report
 * claims a soft navigation can be *silently dropped* — no URL change, no
 * error — under timing-sensitive conditions. These tests hammer every
 * supersede window the scheduling exposes and assert the last navigation
 * always commits: same-tick doubles, reentrant navigation from the
 * isRouting flush, microtask interleavings around the commit task, and
 * supersede across a parked (async-held) navigation transition.
 */
import { render } from "@solidjs/web";
import { createEffect, createMemo, Loading, untrack } from "solid-js";
import {
  createRouter,
  memoryHistory,
  useIsRouting,
  useNavigate,
  type Navigator
} from "../src/index.js";

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
    // navigateFromRoute's firstNavigation branch flushes synchronously so
    // pending-state effects can run; an effect that navigates from that
    // flush overwrites lastTransitionTarget while the outer call is still
    // on the stack — the drop-shaped window from the report's question 1.
    const history = memoryHistory();
    let navigate!: Navigator;
    let redirected = false;
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
      { path: "/a", component: page("a") },
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

  test("rapid-fire navigation bursts always land on the last target", async () => {
    const history = memoryHistory();
    let navigate!: Navigator;
    const app = mount(
      threePages(n => (navigate = n)),
      history
    );
    try {
      for (let round = 0; round < 20; round++) {
        const target = round % 2 ? "/a" : "/b";
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
