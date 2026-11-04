import { render } from "@solidjs/web";
import { vi } from "vitest";
import {
  createRouter,
  hashHistory,
  memoryHistory,
  useLinkState,
  useNavigate,
  type LinkState,
  type Navigator
} from "../src/index.js";

const settle = () => new Promise(r => setTimeout(r, 30));

describe("paths nodes under a base", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  const routes = [
    { path: "/", component: () => <p>home</p> },
    { path: "/about", component: () => <p>about</p> }
  ] as const;

  test("navigate(paths.about) lands on /app/about", async () => {
    const history = memoryHistory("/app");
    const Router = createRouter({ routes, base: "/app", history });
    let navigate!: Navigator;
    const div = document.createElement("div");
    const dispose = render(
      () => <Router>{p => ((navigate = useNavigate()), p.children)}</Router>,
      div
    );
    try {
      await settle();
      expect(String(Router.paths.about)).toBe("/app/about");
      navigate(Router.paths.about);
      await settle();
      expect(history.get()).toBe("/app/about");
      expect(div.textContent).toBe("about");
    } finally {
      dispose();
    }
  });

  test("useLinkState(paths.about) is current on /app/about, like the full-path string", async () => {
    const history = memoryHistory("/app/about");
    const Router = createRouter({ routes, base: "/app", history });
    let node!: LinkState;
    let full!: LinkState;
    let bare!: LinkState;
    let root!: LinkState;
    const div = document.createElement("div");
    const dispose = render(
      () => (
        <Router>
          {p => {
            node = useLinkState(() => Router.paths.about);
            full = useLinkState(() => "/app/about");
            // a leading "/" is a full path: the base is not added
            bare = useLinkState(() => "/about");
            root = useLinkState(() => Router.paths);
            return p.children;
          }}
        </Router>
      ),
      div
    );
    try {
      await settle();
      expect(div.textContent).toBe("about");
      expect([node.active(), node.current()]).toEqual([true, true]);
      expect([full.active(), full.current()]).toEqual([true, true]);
      expect([bare.active(), bare.current()]).toEqual([false, false]);
      expect([root.active(), root.current()]).toEqual([false, false]);
    } finally {
      dispose();
    }
  });
});

describe("paths nodes under hashHistory", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    window.history.replaceState(null, "", "/#/about");
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("useLinkState(paths.about) reads the node's route, not its display href", async () => {
    const Router = createRouter({
      routes: [
        { path: "/", component: () => <p>home</p> },
        { path: "/about", component: () => <p>about</p> }
      ] as const,
      history: hashHistory()
    });
    let link!: LinkState;
    const div = document.createElement("div");
    const dispose = render(
      () => <Router>{p => ((link = useLinkState(() => Router.paths.about)), p.children)}</Router>,
      div
    );
    try {
      await settle();
      expect(String(Router.paths.about)).toBe("#/about");
      expect(div.textContent).toBe("about");
      expect([link.active(), link.current()]).toEqual([true, true]);
    } finally {
      dispose();
    }
  });

  test("navigate(paths.about) and useLinkState(paths.about) under a base", async () => {
    const Router = createRouter({
      routes: [
        { path: "/", component: () => <p>home</p> },
        { path: "/about", component: () => <p>about</p> }
      ] as const,
      base: "/app",
      history: hashHistory()
    });
    window.history.replaceState(null, "", "/#/app");
    let navigate!: Navigator;
    let link!: LinkState;
    const div = document.createElement("div");
    const dispose = render(
      () => (
        <Router>
          {p => (
            (navigate = useNavigate()), (link = useLinkState(() => Router.paths.about)), p.children
          )}
        </Router>
      ),
      div
    );
    try {
      await settle();
      expect(div.textContent).toBe("home");
      navigate(Router.paths.about);
      await settle();
      expect(window.location.hash).toBe("#/app/about");
      expect(div.textContent).toBe("about");
      expect([link.active(), link.current()]).toEqual([true, true]);
    } finally {
      dispose();
    }
  });
});
