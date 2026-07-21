import { render } from "@solidjs/web";
import { vi } from "vitest";
import {
  createRouter,
  memoryHistory,
  useLinkState,
  useMatches,
  useNavigate,
  useParams,
  usePreloadRoute,
  useSearchParams,
  int
} from "../src/index.js";
import type { Navigator, StandardSchemaV1 } from "../src/index.js";

/** A tiny hand-rolled Standard Schema: parses `page` to a number (default 1), requires `q` to be a string (default ""). */
const searchSchema: StandardSchemaV1<
  { q?: string; page?: number },
  { q: string; page: number }
> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value: any) {
      const page = value.page === undefined ? 1 : Number(value.page);
      if (Number.isNaN(page)) return { issues: [{ message: "page must be numeric" }] };
      return { value: { q: String(value.q ?? ""), page } };
    }
  }
};

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

describe("createRouter factory", () => {
  const routes = [
    { path: "/", component: () => <div data-route="home">Home</div> },
    { path: "/about", component: () => <div data-route="about">About</div> },
    {
      path: "/users/:id",
      matchFilters: { id: int },
      component: (props: any) => <div data-route="user">{props.children}</div>,
      children: [
        { path: "/", component: () => <div data-route="user-overview">Overview</div> },
        { path: "/settings", component: () => <div data-route="user-settings">Settings</div> }
      ]
    },
    { path: "*404", component: () => <div data-route="not-found">Not Found</div> }
  ] as const;

  describe("paths proxy", () => {
    const { paths } = createRouter({ routes });

    test("terminates the root with a zero-arg call", () => {
      expect(paths()).toBe("/");
    });

    test("builds static segments through property access", () => {
      expect(paths.about()).toBe("/about");
      expect(String(paths.about)).toBe("/about");
      expect(`${paths.about}`).toBe("/about");
    });

    test("binds params through calls and stays chainable", () => {
      expect(String(paths.users(2))).toBe("/users/2");
      expect(paths.users(2).settings()).toBe("/users/2/settings");
      expect(String(paths.users(2).settings)).toBe("/users/2/settings");
    });

    test("terminates with a search object and optional hash", () => {
      expect(paths.users(2, { tab: "x" })).toBe("/users/2?tab=x");
      expect(paths.users(2, { tab: "x" }, "comments")).toBe("/users/2?tab=x#comments");
      expect(paths.about({ q: "solid", page: 2 })).toBe("/about?q=solid&page=2");
      expect(paths({ q: "root" })).toBe("/?q=root");
    });

    test("drops empty search values and encodes params", () => {
      expect(paths.about({ q: undefined })).toBe("/about");
      // @ts-expect-error not a declared route — runtime is tree-agnostic
      expect(String(paths.files("a b"))).toBe("/files/a%20b");
    });
  });

  test("paths proxy is render-path aware and base aware", () => {
    const hashLike = createRouter({
      routes,
      history: { get: () => "/", set: () => {}, utils: { renderPath: p => `#${p}` } }
    });
    expect(hashLike.paths.users(2).settings()).toBe("#/users/2/settings");
    expect(hashLike.paths()).toBe("#/");

    const based = createRouter({ routes, base: "/app" });
    expect(based.paths.about()).toBe("/app/about");
  });

  describe("match()", () => {
    const Router = createRouter({ routes });

    test("matches arbitrary urls root→leaf without rendering", () => {
      expect(Router.match("/users/2/settings?tab=x")).toEqual([
        { path: "/users/:id", pattern: "/users/:id", match: "/users/2", params: { id: "2" }, info: undefined },
        {
          path: "/settings",
          pattern: "/users/:id/settings",
          match: "/users/2/settings",
          params: { id: "2" },
          info: undefined
        }
      ]);
    });

    test("respects match filters", () => {
      const matches = Router.match("/users/abc");
      expect(matches).toHaveLength(1);
      expect(matches[0].path).toBe("*404");
    });

    test("returns an empty array when nothing matches", () => {
      const Bare = createRouter({ routes: [{ path: "/only" }] as const });
      expect(Bare.match("/other")).toEqual([]);
    });
  });

  describe("as a component", () => {
    const originalScrollTo = window.scrollTo;
    beforeEach(() => {
      window.scrollTo = vi.fn();
    });
    afterAll(() => {
      window.scrollTo = originalScrollTo;
    });

    test("renders matched routes and navigates with typed paths", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      let navigate!: Navigator;
      const Home = () => {
        navigate = useNavigate();
        return <div data-route="home">Home</div>;
      };
      const User = () => {
        const params = useParams();
        return <div data-route="user">{params.id}</div>;
      };

      const Router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/users/:id", component: User }
        ] as const,
        history: memoryHistory()
      });

      const dispose = render(() => <Router />, div);
      try {
        expect(div.querySelector('[data-route="home"]')?.textContent).toBe("Home");

        navigate(Router.paths.users(2));
        await settle();

        expect(div.querySelector('[data-route="home"]')).toBeNull();
        expect(div.querySelector('[data-route="user"]')?.textContent).toBe("2");
      } finally {
        dispose();
        div.remove();
      }
    });

    test("useMatches exposes the matched chain's info reactively", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      let navigate!: Navigator;
      let matches!: ReturnType<typeof useMatches>;
      const Shell = (props: any) => {
        navigate = useNavigate();
        matches = useMatches();
        return props.children;
      };

      const Router = createRouter({
        routes: [
          {
            path: "/users",
            info: { breadcrumb: "Users" },
            component: (props: any) => props.children,
            children: [
              { path: "/", info: { breadcrumb: "All" }, component: () => null },
              { path: "/:id", info: { breadcrumb: "Profile" }, component: () => null }
            ]
          }
        ] as const,
        history: memoryHistory("/users")
      });

      const dispose = render(() => <Router>{props => <Shell {...props} />}</Router>, div);
      try {
        await settle();
        expect(matches().map(m => m.route.info!.breadcrumb)).toEqual(["Users", "All"]);

        navigate("/users/2");
        await settle();
        expect(matches().map(m => m.route.info!.breadcrumb)).toEqual(["Users", "Profile"]);
        expect(matches()[1].params).toEqual({ id: "2" });

        // mutating the returned array must not corrupt router state
        matches().reverse();
        expect(matches().map(m => m.route.info!.breadcrumb)).toEqual(["Users", "Profile"]);
      } finally {
        dispose();
        div.remove();
      }
    });

    test("usePreloadRoute warms a route's preload without navigating", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

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
            path: "/users/:id",
            preload: ({ params, intent }) => preloaded(params.id, intent),
            component: () => <div data-route="user">User</div>
          }
        ] as const,
        history: memoryHistory()
      });

      const dispose = render(() => <Router />, div);
      try {
        await settle();
        // typed path nodes are accepted alongside strings and URLs
        preload(Router.paths.users(7), { preloadData: true });
        expect(preloaded).toHaveBeenCalledWith("7", "preload");

        // preloading is not a navigation
        await settle();
        expect(div.querySelector('[data-route="home"]')).toBeTruthy();
        expect(div.querySelector('[data-route="user"]')).toBeNull();

        // without preloadData only lazy components load, not route data
        preload("/users/9");
        expect(preloaded).toHaveBeenCalledTimes(1);
      } finally {
        dispose();
        div.remove();
      }
    });

    test("treats the render-prop child as the root and passes preload data", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      const preload = vi.fn(() => "warmed");
      const Router = createRouter({
        routes: [{ path: "/", component: () => <div data-route="home">Home</div> }] as const,
        history: memoryHistory(),
        preload
      });

      const dispose = render(
        () => (
          <Router>
            {props => (
              <div data-shell data-preloaded={props.data}>
                {props.children}
              </div>
            )}
          </Router>
        ),
        div
      );
      try {
        await settle();
        const shell = div.querySelector("[data-shell]")!;
        expect(shell.getAttribute("data-preloaded")).toBe("warmed");
        expect(shell.querySelector('[data-route="home"]')?.textContent).toBe("Home");
        expect(preload).toHaveBeenCalledTimes(1);
        expect(preload).toHaveBeenCalledWith(expect.objectContaining({ intent: "initial" }));
      } finally {
        dispose();
        div.remove();
      }
    });

    test("parses search params through the matched route's Standard Schema", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      let search!: { q: string; page: number };
      let setSearch!: (params: Partial<{ q?: string; page?: number }>) => void;

      const Router = createRouter({
        routes: [
          {
            path: "/search",
            search: searchSchema,
            component: () => {
              const proxied = useSearchParams(Router.paths.search);
              search = proxied[0];
              setSearch = proxied[1];
              return <div data-route="search" />;
            }
          }
        ] as const,
        history: memoryHistory("/search?q=solid")
      });

      const dispose = render(() => <Router />, div);
      try {
        // parsed output: defaults applied, page coerced to a number
        expect(search.q).toBe("solid");
        expect(search.page).toBe(1);

        setSearch({ page: 2 });
        await settle();
        expect(search.page).toBe(2);
        expect(typeof search.page).toBe("number");

        // a failing schema leaves the raw values rather than throwing
        setSearch({ page: "abc" as any });
        await settle();
        expect(search.page as any).toBe("abc");
      } finally {
        dispose();
        div.remove();
      }
    });

    test("exposes reactive link state for custom link components", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      let navigate!: Navigator;
      let usersLink!: ReturnType<typeof useLinkState>;
      let settingsLink!: ReturnType<typeof useLinkState>;
      let exactUsersLink!: ReturnType<typeof useLinkState>;

      const Router = createRouter({
        routes: [
          {
            path: "/users/:id",
            component: (props: any) => props.children,
            children: [
              { path: "/", component: () => <div data-route="overview" /> },
              { path: "/settings", component: () => <div data-route="settings" /> }
            ]
          }
        ] as const,
        history: memoryHistory("/users/2")
      });

      const dispose = render(
        () => (
          <Router>
            {props => {
              navigate = useNavigate();
              usersLink = useLinkState(() => String(Router.paths.users(2)));
              settingsLink = useLinkState(() => String(Router.paths.users(2).settings));
              exactUsersLink = useLinkState(() => String(Router.paths.users(2)), { end: true });
              return props.children;
            }}
          </Router>
        ),
        div
      );
      try {
        // on /users/2: the users link is current, settings is not active
        expect(usersLink.active()).toBe(true);
        expect(usersLink.current()).toBe(true);
        expect(exactUsersLink.active()).toBe(true);
        expect(settingsLink.active()).toBe(false);

        navigate(Router.paths.users(2).settings);
        await settle();

        // on /users/2/settings: prefix-active but no longer current; `end` opts out
        expect(usersLink.active()).toBe(true);
        expect(usersLink.current()).toBe(false);
        expect(exactUsersLink.active()).toBe(false);
        expect(settingsLink.active()).toBe(true);
        expect(settingsLink.current()).toBe(true);
        expect(settingsLink.pending()).toBe(false);
      } finally {
        dispose();
        div.remove();
      }
    });

    test("starts from the memory history's initial url", async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      const Router = createRouter({
        routes: [
          { path: "/", component: () => <div data-route="home">Home</div> },
          { path: "/users/:id", component: () => <div data-route="user">User</div> }
        ] as const,
        history: memoryHistory("/users/1")
      });

      const dispose = render(() => <Router />, div);
      try {
        expect(div.querySelector('[data-route="user"]')).toBeTruthy();
      } finally {
        dispose();
        div.remove();
      }
    });
  });
});
