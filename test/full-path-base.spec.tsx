import { render, redirect } from "@solidjs/web";
import { vi } from "vitest";
import {
  createRouter,
  hashHistory,
  memoryHistory,
  query,
  useLinkState,
  useNavigate,
  useResolvedPath,
  type LinkState,
  type Navigator
} from "../src/index.js";

// Under a `base`, a leading "/" is a full document path: the router never
// adds the base to it. `paths` nodes already hold the base, so they are the
// portable spelling. Route-relative strings still resolve against the route.

const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

const routes = [
  { path: "/", component: () => <p>home</p> },
  { path: "/about", component: () => <p>about</p> },
  { path: "/login", component: () => <p>login</p> }
] as const;

type Kind = "memory" | "hash";

const originalScrollTo = window.scrollTo;
beforeEach(() => {
  window.scrollTo = vi.fn() as any;
  window.history.replaceState(null, "", "/#/app");
  query.clear();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  query.clear();
});
afterAll(() => {
  window.scrollTo = originalScrollTo;
});

function setup(kind: Kind, extra: readonly any[] = []) {
  const history = kind === "memory" ? memoryHistory("/app") : undefined;
  const Router = createRouter({
    routes: [...routes, ...extra],
    base: "/app",
    history: history || hashHistory()
  });
  const at = () => (history ? history.get() : window.location.hash.slice(1));
  let navigate!: Navigator;
  const resolved: Record<string, () => string | undefined> = {};
  const links: Record<string, LinkState> = {};
  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(
    () => (
      <Router>
        {p => {
          navigate = useNavigate();
          for (const to of ["/about", "/app/about", "about"]) {
            resolved[to] = useResolvedPath(() => to);
            links[to] = useLinkState(() => to);
          }
          links.node = useLinkState(() => Router.paths.about);
          return (
            <>
              <a data-testid="full" href={kind === "hash" ? "#/app/about" : "/app/about"} />
              {p.children}
            </>
          );
        }}
      </Router>
    ),
    div
  );
  const state = (key: string) => [links[key].active(), links[key].current()];
  const cleanup = () => {
    dispose();
    div.remove();
  };
  return { Router, div, at, navigate: (to: any) => navigate(to), resolved, state, cleanup };
}

describe.each<Kind>(["memory", "hash"])("a leading slash is a full path (%s history)", kind => {
  test("useResolvedPath: a leading slash keeps its path; a relative path gets the base", async () => {
    const { resolved, cleanup } = setup(kind);
    try {
      await settle();
      expect(resolved["/about"]()).toBe("/about");
      expect(resolved["/app/about"]()).toBe("/app/about");
      expect(resolved["about"]()).toBe("/app/about");
    } finally {
      cleanup();
    }
  });

  test("navigate: a full path and a paths node land on /app/about", async () => {
    const { Router, div, at, navigate, cleanup } = setup(kind);
    try {
      await settle();
      expect(div.textContent).toBe("home");
      for (const to of ["/app/about", Router.paths.about]) {
        navigate("/app");
        await settle();
        expect(div.textContent).toBe("home");
        navigate(to);
        await settle();
        expect(at()).toBe("/app/about");
        expect(div.textContent).toBe("about");
      }
    } finally {
      cleanup();
    }
  });

  test("navigate('/about') does not add the base", async () => {
    const { at, navigate, cleanup } = setup(kind);
    try {
      await settle();
      navigate("/about");
      await settle();
      expect(at()).toBe("/about");
    } finally {
      cleanup();
    }
  });

  test("useLinkState: the full path and the node are current; '/about' is not", async () => {
    const { navigate, state, cleanup } = setup(kind);
    try {
      navigate("/app/about");
      await settle();
      expect(state("/app/about")).toEqual([true, true]);
      expect(state("node")).toEqual([true, true]);
      expect(state("about")).toEqual([true, true]);
      expect(state("/about")).toEqual([false, false]);
    } finally {
      cleanup();
    }
  });

  test("an anchor to the full path navigates softly", async () => {
    const { div, at, cleanup } = setup(kind);
    try {
      await settle();
      const a = div.querySelector<HTMLAnchorElement>('[data-testid="full"]')!;
      a.click();
      await settle();
      expect(at()).toBe("/app/about");
      expect(div.textContent).toBe("about");
    } finally {
      cleanup();
    }
  });

  test.each([
    ["a paths node", (Router: any) => redirect(Router.paths.login)],
    ["a full-path string", () => redirect("/app/login")]
  ])("a query redirect to %s lands on /app/login", async (_, make) => {
    let Router!: any;
    const read = query(async () => make(Router), `full-path-redirect-${kind}`);
    const Guard = () => {
      read();
      return <p>guarded</p>;
    };
    const s = setup(kind, [{ path: "/guarded", component: Guard }]);
    Router = s.Router;
    try {
      await settle();
      s.navigate("/app/guarded");
      await settle(100);
      expect(s.at()).toBe("/app/login");
      expect(s.div.textContent).toBe("login");
    } finally {
      s.cleanup();
    }
  });
});
