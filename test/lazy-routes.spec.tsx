// Lazy route subtrees: `children` as a thunk (`() => import("./routes")`).
// The table's code loads on demand — hover intent or navigation kicks it and
// the load folds into the navigation transition — while matching, params,
// preloads, and `match()` all continue through the resolved routes.
import { render } from "@solidjs/web";
import { vi } from "vitest";
import {
  createRouter,
  defineRoutes,
  memoryHistory,
  useNavigate,
  useParams,
  usePreloadRoute
} from "../src/index.js";
import type { Navigator } from "../src/index.js";

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

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

describe("lazy route subtrees", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("navigating into an unresolved subtree loads the table once and renders inner routes", async () => {
    let thunkCalls = 0;
    let navigate!: Navigator;
    const Home = () => {
      navigate = useNavigate();
      return <div data-route="home">Home</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        {
          path: "/plugins",
          component: (props: any) => <section data-route="plugins">{props.children}</section>,
          children: () => {
            thunkCalls++;
            return Promise.resolve({ default: pluginRoutes });
          }
        }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
      expect(thunkCalls).toBe(0);

      navigate("/plugins/widgets/7");
      await settle(10);

      expect(thunkCalls).toBe(1);
      expect(div.querySelector('[data-route="plugins"]')).toBeTruthy();
      expect(div.querySelector('[data-route="widget"]')?.textContent).toBe("7");

      // resolution is cached: leaving and returning does not reload the table
      navigate("/");
      await settle();
      navigate("/plugins");
      await settle(10);
      expect(thunkCalls).toBe(1);
      expect(div.querySelector('[data-route="plugin-home"]')).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  test("the load folds into the navigation transition — old screen holds until the table lands", async () => {
    let resolveTable!: (m: { default: typeof pluginRoutes }) => void;
    let navigate!: Navigator;
    const Home = () => {
      navigate = useNavigate();
      return <div data-route="home">Home</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        {
          path: "/plugins",
          children: () => new Promise<{ default: typeof pluginRoutes }>(r => (resolveTable = r))
        }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      navigate("/plugins/widgets/5");
      await settle(10);

      // table still in flight: the transition is pending, the old screen shows
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
      expect(div.querySelector('[data-route="widget"]')).toBeNull();

      resolveTable({ default: pluginRoutes });
      await settle(10);

      expect(div.querySelector('[data-route="home"]')).toBeNull();
      expect(div.querySelector('[data-route="widget"]')?.textContent).toBe("5");
    } finally {
      cleanup();
    }
  });

  test("initial render inside an unresolved subtree resolves and renders", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/plugins",
          component: (props: any) => <section data-route="plugins">{props.children}</section>,
          children: () => Promise.resolve(pluginRoutes)
        }
      ] as const,
      history: memoryHistory("/plugins/widgets/3")
    });

    const { div, cleanup } = mount(Router);
    try {
      await settle(10);
      expect(div.querySelector('[data-route="widget"]')?.textContent).toBe("3");
    } finally {
      cleanup();
    }
  });

  test("a static sibling beats the unresolved boundary without kicking the load", async () => {
    let thunkCalls = 0;
    const Router = createRouter({
      routes: [
        {
          path: "/plugins",
          children: () => {
            thunkCalls++;
            return Promise.resolve({ default: pluginRoutes });
          }
        },
        { path: "/plugins/builtin", component: () => <div data-route="builtin">Builtin</div> }
      ] as const,
      history: memoryHistory("/plugins/builtin")
    });

    const { div, cleanup } = mount(Router);
    try {
      await settle(10);
      expect(div.querySelector('[data-route="builtin"]')).toBeTruthy();
      expect(thunkCalls).toBe(0);
    } finally {
      cleanup();
    }
  });

  test("intent preload kicks the table load and continues into inner preloads", async () => {
    let thunkCalls = 0;
    const preloaded = vi.fn();
    let preload!: ReturnType<typeof usePreloadRoute>;
    const Home = () => {
      preload = usePreloadRoute();
      return <div data-route="home">Home</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        {
          path: "/plugins",
          children: () => {
            thunkCalls++;
            return Promise.resolve({
              default: [
                {
                  path: "/widgets/:id",
                  preload: ({ params, intent }: any) => preloaded(params.id, intent),
                  component: () => <div data-route="widget" />
                }
              ]
            });
          }
        }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      await settle();
      preload("/plugins/widgets/7", { preloadData: true });
      expect(thunkCalls).toBe(1);
      // the inner preload can only run once the table lands
      expect(preloaded).not.toHaveBeenCalled();

      await settle(10);
      expect(preloaded).toHaveBeenCalledWith("7", "preload");
      // preloading is not a navigation
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  test("match() sees the boundary before resolution and the real routes after", async () => {
    const Router = createRouter({
      routes: [{ path: "/plugins", children: () => Promise.resolve({ default: pluginRoutes }) }] as const,
      history: memoryHistory("/plugins")
    });

    const before = Router.match("/plugins/widgets/7");
    expect(before).toHaveLength(2);
    expect(before[1].pattern).toBe("/plugins/*");
    // the placeholder records no params
    expect(before[1].params).toEqual({});

    // rendering the boundary kicks resolution through the shared machinery
    const { cleanup } = mount(Router);
    try {
      await settle(10);
    } finally {
      cleanup();
    }

    const after = Router.match("/plugins/widgets/7");
    expect(after.map(m => m.pattern)).toEqual(["/plugins", "/plugins/widgets/:id"]);
    expect(after[1].params).toEqual({ id: "7" });
  });

  test("a thunk returning a plain array (or a `routes` export) also resolves", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/a",
          children: () => [{ path: "/x", component: () => <div data-route="ax" /> }]
        },
        {
          path: "/b",
          children: () => Promise.resolve({ routes: [{ path: "/y", component: () => <div data-route="by" /> }] })
        }
      ] as const,
      history: memoryHistory("/a/x")
    });

    const { div, cleanup } = mount(Router);
    try {
      await settle(10);
      expect(div.querySelector('[data-route="ax"]')).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
