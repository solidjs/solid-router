// Observe tier: every client location write is declared to solid's
// attribution engine as a navigation (`OBSERVE.attribution.withOrigin`), so
// holds and re-runs it causes are named after the route, redirect hops fold
// onto the navigation they belong to, and a lazy subtree that resolved during
// the hold names the exact route it landed on. Nothing here exists in the
// production build: `OBSERVE` is undefined there and the declaration folds out.
import { createMemo } from "solid-js";
import { render } from "@solidjs/web";
import { attribution } from "solid-js/attribution";
import { vi } from "vitest";
import {
  createRouter,
  defineRoutes,
  memoryHistory,
  query,
  useNavigate,
  useParams
} from "../src/index.js";
import type { Navigator } from "../src/index.js";

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

const redirectResponse = (to: string) =>
  new Response(null, { status: 302, headers: { Location: to } });

function mount(Router: (props: any) => any) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(() => <Router />, div);
  return {
    div,
    cleanup() {
      dispose();
      div.remove();
    }
  };
}

const last = () => attribution.navigations()[attribution.navigations().length - 1];

describe("observe tier: navigations declared to attribution", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
    attribution.enable({ log: false });
  });
  afterEach(() => attribution.disable());
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("navigate() declares the parametrized route, params, and origin location", async () => {
    let navigate!: Navigator;
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div data-route="home">Home</div>;
          }
        },
        {
          path: "/users/:id",
          component: () => {
            const params = useParams();
            return <div data-route="user">{params.id}</div>;
          }
        }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      const before = attribution.navigations().length;
      navigate("/users/42");
      await settle();
      expect(div.querySelector('[data-route="user"]')?.textContent).toBe("42");

      expect(attribution.navigations().length).toBe(before + 1);
      const nav = last();
      expect(nav.name).toBe("/users/:id");
      expect(nav.to).toBe("/users/42");
      expect(nav.from).toBe("/");
      expect(nav.params).toEqual({ id: "42" });
      expect(nav.redirects).toBeUndefined();
      expect(nav.outcome).toBe("committed");
    } finally {
      cleanup();
    }
  });

  test("the root route is named '/' rather than its empty pattern", async () => {
    let navigate!: Navigator;
    const Router = createRouter({
      routes: [
        { path: "/", component: () => <div data-route="home">Home</div> },
        {
          path: "/about",
          component: () => {
            navigate = useNavigate();
            return <div data-route="about">About</div>;
          }
        }
      ] as const,
      history: memoryHistory("/about")
    });
    const { cleanup } = mount(Router);
    try {
      navigate("/");
      await settle();
      expect(last().name).toBe("/");
      expect(last().from).toBe("/about");
    } finally {
      cleanup();
    }
  });

  test("a redirect thrown while the navigation is pending is a hop of that navigation, not a new one", async () => {
    let navigate!: Navigator;
    const getFiles = query(async () => {
      await new Promise(r => setTimeout(r, 10));
      throw redirectResponse("/login");
    }, "observe-files");
    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return <span>files:{String(files())}</span>;
    };
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div data-route="home">Home</div>;
          }
        },
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span data-route="login">login-page</span> }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      const before = attribution.navigations().length;
      navigate("/files");
      await settle(60);
      expect(div.querySelector('[data-route="login"]')).toBeTruthy();

      // one navigation, two writes, the abandoned destination recorded as a hop
      expect(attribution.navigations().length).toBe(before + 1);
      const nav = last();
      expect(nav.name).toBe("/login");
      expect(nav.to).toBe("/login");
      expect(nav.from).toBe("/");
      expect(nav.writes).toBe(2);
      expect(nav.redirects?.map(h => h.to)).toEqual(["/files"]);
      expect(nav.redirects?.[0].name).toBe("/files");
      expect(nav.outcome).toBe("held");
    } finally {
      cleanup();
    }
  });

  test("a lazy subtree that loads during the hold names the exact route it resolved to", async () => {
    let navigate!: Navigator;
    const pluginRoutes = defineRoutes([
      { path: "/", component: () => <div data-route="plugin-home">Plugins</div> },
      {
        path: "/widgets/:id",
        component: () => {
          const params = useParams();
          return <div data-route="widget">{params.id}</div>;
        }
      }
    ]);
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div data-route="home">Home</div>;
          }
        },
        {
          path: "/plugins",
          component: (props: any) => <section data-route="plugins">{props.children}</section>,
          children: () => Promise.resolve({ default: pluginRoutes })
        }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      navigate("/plugins/widgets/7");
      // At declaration only the placeholder matches; the engine re-reads the
      // ref at settle, by which time the table has loaded.
      expect(last().to).toBe("/plugins/widgets/7");
      await settle(10);
      expect(div.querySelector('[data-route="widget"]')?.textContent).toBe("7");
      const nav = last();
      expect(nav.name).toBe("/plugins/widgets/:id");
      expect(nav.params).toEqual({ id: "7" });
      expect(nav.outcome).toBe("held");
    } finally {
      cleanup();
    }
  });

  test("the browser moving (back/forward) is declared too", async () => {
    let navigate!: Navigator;
    const history = memoryHistory();
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div data-route="home">Home</div>;
          }
        },
        { path: "/users/:id", component: () => <div data-route="user">user</div> }
      ] as const,
      history
    });
    const { div, cleanup } = mount(Router);
    try {
      navigate("/users/1");
      await settle();
      expect(div.querySelector('[data-route="user"]')).toBeTruthy();

      const before = attribution.navigations().length;
      history.go(-1);
      await settle();
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
      expect(attribution.navigations().length).toBe(before + 1);
      const nav = last();
      expect(nav.name).toBe("/");
      expect(nav.from).toBe("/users/1");
      expect(nav.redirects).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
