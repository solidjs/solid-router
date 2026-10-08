import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, useNavigate } from "../src/index.js";
import type { Navigator } from "../src/index.js";
import { createScrollRestoration } from "../src/routers/scrollRestoration.js";

// jsdom implements history traversal but not scrolling — stub the primitives
// so the restoration path (capture on scroll, restore via scrollTo) is
// observable.
function stubScrolling() {
  let y = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
  const scrollTo = vi.fn((_x: number, newY: number) => {
    y = newY;
    window.dispatchEvent(new Event("scroll"));
  });
  window.scrollTo = scrollTo as any;
  return {
    scrollTo,
    scrollUserTo(newY: number) {
      y = newY;
      window.dispatchEvent(new Event("scroll"));
    }
  };
}

describe("scroll restoration (#577)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.history.scrollRestoration = "auto";
    sessionStorage.clear();
  });

  test("is on by default with browser history, off with a custom adapter, and opt-out", () => {
    stubScrolling();
    const routes = [{ path: "/", component: () => null }] as const;

    const DefaultRouter = createRouter({ routes });
    let dispose = render(() => <DefaultRouter />, document.body);
    expect(window.history.scrollRestoration).toBe("manual");
    document.body.innerHTML = "";
    dispose();

    window.history.scrollRestoration = "auto";
    const OptOutRouter = createRouter({ routes, scrollRestoration: false });
    dispose = render(() => <OptOutRouter />, document.body);
    expect(window.history.scrollRestoration).toBe("auto");
    document.body.innerHTML = "";
    dispose();

    const MemoryRouter = createRouter({ routes, history: memoryHistory() });
    dispose = render(() => <MemoryRouter />, document.body);
    expect(window.history.scrollRestoration).toBe("auto");
    document.body.innerHTML = "";
    dispose();
  });

  test("pagehide hands the entry back to the browser, a bfcache restore takes it again, and dispose unbinds", () => {
    stubScrolling();
    const Router = createRouter({ routes: [{ path: "/", component: () => null }] as const });
    const dispose = render(() => <Router />, document.body);
    const modes: string[] = [window.history.scrollRestoration];
    let saved: string | null = null;
    try {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      modes.push(window.history.scrollRestoration);
      saved = sessionStorage.getItem("solid-router:scroll");
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      modes.push(window.history.scrollRestoration);
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      modes.push(window.history.scrollRestoration);
      window.dispatchEvent(new Event("load"));
      modes.push(window.history.scrollRestoration);
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    modes.push(window.history.scrollRestoration);
    expect(saved).not.toBeNull();
    // created manual; pagehide auto; a fresh pageshow is a new document (no-op
    // here); persisted pageshow manual; a client-rendered router never waits
    // for load; disposed, it no longer listens
    expect(modes).toEqual(["manual", "auto", "auto", "manual", "manual", "manual"]);
  });

  test("a client-rendered reload restores at the first settle even when the entry is auto", async () => {
    const scrolling = stubScrolling();
    sessionStorage.setItem("solid-router:scroll", JSON.stringify({ 0: 600 }));
    window.history.replaceState({ _depth: 0 }, "", "/");
    const entries = [{ type: "reload" }];
    const getEntriesByType = performance.getEntriesByType;
    performance.getEntriesByType = ((type: string) =>
      type === "navigation" ? entries : []) as any;
    const Router = createRouter({ routes: [{ path: "/", component: () => <p>page</p> }] as const });
    const dispose = render(() => <Router />, document.body);
    try {
      expect(window.history.scrollRestoration).toBe("manual");
      await vi.waitFor(() => expect(scrolling.scrollTo).toHaveBeenCalledWith(0, 600));
    } finally {
      performance.getEntriesByType = getEntriesByType;
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("restores the saved position on back navigation", async () => {
    const scrolling = stubScrolling();
    let navigate!: Navigator;

    const Long = () => {
      navigate = useNavigate();
      return <div data-testid="long">long</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Long },
        { path: "/short", component: () => <div data-testid="short">short</div> }
      ] as const
    });

    const dispose = render(() => <Router />, document.body);

    try {
      expect(window.history.scrollRestoration).toBe("manual");

      // user scrolls down the long page, then navigates away
      scrolling.scrollUserTo(3000);
      navigate("/short");
      await vi.waitFor(() => expect(document.querySelector("[data-testid=short]")).toBeTruthy());
      // push navigations still scroll to the top
      expect(scrolling.scrollTo).toHaveBeenLastCalledWith(0, 0);

      window.history.back();
      await vi.waitFor(() => expect(document.querySelector("[data-testid=long]")).toBeTruthy());
      await vi.waitFor(() => expect(scrolling.scrollTo).toHaveBeenLastCalledWith(0, 3000));
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("a push prunes saved positions for truncated forward entries", async () => {
    const scrolling = stubScrolling();
    let navigate!: Navigator;

    const Page = () => {
      navigate = useNavigate();
      return <div data-testid="page">page</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Page },
        { path: "/a", component: Page },
        { path: "/b", component: Page }
      ] as const
    });

    const dispose = render(() => <Router />, document.body);

    try {
      navigate("/a");
      await vi.waitFor(() => expect(window.location.pathname).toBe("/a"));
      scrolling.scrollUserTo(500);

      window.history.back();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/"));

      // pushing /b truncates the forward entry (/a at the same depth) — its
      // saved position must not leak into the fresh /b entry
      navigate("/b");
      await vi.waitFor(() => expect(window.location.pathname).toBe("/b"));
      scrolling.scrollTo.mockClear();

      window.history.back();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
      window.history.forward();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/b"));
      await Promise.resolve();
      expect(scrolling.scrollTo).not.toHaveBeenCalledWith(0, 500);
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
});

// A hydrating router leaves a handed-back entry to the browser's native
// restore. jsdom cannot hydrate, so these drive the restoration directly with
// the flag the router passes from `isHydrating()`.
describe("scroll restoration on a server-rendered arrival", () => {
  let readyState: DocumentReadyState;
  let getEntriesByType: typeof performance.getEntriesByType;
  beforeEach(() => {
    window.history.replaceState({ _depth: 0 }, "", "/");
    window.history.scrollRestoration = "auto";
    sessionStorage.clear();
    sessionStorage.setItem("solid-router:scroll", JSON.stringify({ 0: 800 }));
    readyState = "loading";
    Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
    getEntriesByType = performance.getEntriesByType;
    performance.getEntriesByType = ((type: string) =>
      type === "navigation" ? [{ type: "reload" }] : []) as any;
  });
  afterEach(() => {
    delete (document as any).readyState;
    performance.getEntriesByType = getEntriesByType;
  });

  function arrive(hydrating: boolean) {
    return createRoot(dispose => {
      const restoration = createScrollRestoration(hydrating);
      restoration.create();
      return { restoration, dispose };
    });
  }
  const tick = () => new Promise(resolve => setTimeout(resolve));

  test("an auto entry stays the browser's until a task after load, and the router never scrolls it", async () => {
    const { scrollTo } = stubScrolling();
    const { restoration, dispose } = arrive(true);
    try {
      const modes = [window.history.scrollRestoration];
      restoration.settled();
      readyState = "complete";
      window.dispatchEvent(new Event("load"));
      // WebKit restores just after the load event; a write inside it suppresses that
      modes.push(window.history.scrollRestoration);
      await tick();
      modes.push(window.history.scrollRestoration);
      expect(modes).toEqual(["auto", "auto", "manual"]);
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  test("an entry handed back on pagehide is deferred even when the mode reads manual (Firefox after a reload)", async () => {
    const { scrollTo } = stubScrolling();
    window.history.scrollRestoration = "manual";
    sessionStorage.setItem("solid-router:scroll-auto", JSON.stringify({ 0: 1 }));
    const { restoration, dispose } = arrive(true);
    try {
      restoration.settled();
      readyState = "complete";
      window.dispatchEvent(new Event("load"));
      await tick();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(window.history.scrollRestoration).toBe("manual");
    } finally {
      dispose();
    }
  });

  test("an entry never handed back gets the router's restore, as before", () => {
    const { scrollTo } = stubScrolling();
    window.history.scrollRestoration = "manual";
    const { restoration, dispose } = arrive(true);
    try {
      restoration.settled();
      expect(scrollTo).toHaveBeenCalledWith(0, 800);
    } finally {
      dispose();
    }
  });

  test("hydrating after load takes manual at once", () => {
    stubScrolling();
    readyState = "complete";
    const { dispose } = arrive(true);
    try {
      expect(window.history.scrollRestoration).toBe("manual");
    } finally {
      dispose();
    }
  });

  test("a client navigation before load takes manual before writing history", () => {
    const { scrollTo } = stubScrolling();
    const { restoration, dispose } = arrive(true);
    try {
      restoration.beforeWrite();
      expect(window.history.scrollRestoration).toBe("manual");
      // the load that follows has nothing left to do
      window.history.scrollRestoration = "auto";
      window.dispatchEvent(new Event("load"));
      expect(window.history.scrollRestoration).toBe("auto");
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  test("pagehide records the handed-back depth; a push prunes it with the dead forward entries", () => {
    stubScrolling();
    window.history.scrollRestoration = "manual";
    const { restoration, dispose } = arrive(false);
    const stored = () => JSON.parse(sessionStorage.getItem("solid-router:scroll-auto")!);
    try {
      window.history.pushState({ _depth: 1 }, "", "/a");
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      expect(stored()).toEqual({ 1: 1 });
      // a push landing on depth 0 truncates the handed-back entry at depth 1
      window.history.replaceState({ _depth: 0 }, "", "/");
      restoration.onPush();
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
      expect(stored()).toEqual({ 0: 1 });
    } finally {
      dispose();
    }
  });

  test("dispose unbinds the load handler and cancels a pending claim", async () => {
    stubScrolling();
    const { dispose } = arrive(true);
    window.dispatchEvent(new Event("load"));
    dispose();
    await tick();
    expect(window.history.scrollRestoration).toBe("auto");
    window.dispatchEvent(new Event("load"));
    await tick();
    expect(window.history.scrollRestoration).toBe("auto");
  });
});
