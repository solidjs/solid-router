// Server component routes: `serverRouteComponent(source)` as a route
// `component`, where `source` is the app's `query(fn, key)` (or `liveQuery`).
// The router derives the call from the match (this level's params, the
// declared search output), mounts the resolved server component through
// `dynamic`, fills its `children` position with the outlet, and calls the
// same source under preload intent. The key is the app's: `revalidate(key)`
// reaches the route.
//
// These specs run without a transport: a "server function" here is a plain
// async function carrying the registered-symbol brand `isServerFunction`
// detects, resolving to a component. Frame-stream morphing is the transport's
// business (@solidjs/web frames) — what the router owns is WHICH call is made,
// WHEN it is re-made, and where the outlet lands.
import { Loading } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import {
  createRouter,
  defineRoute,
  memoryHistory,
  query,
  revalidate,
  serverRouteComponent,
  useNavigate,
  usePreloadRoute
} from "../src/index.js";
import type { Navigator, ServerRouteArgs, StandardSchemaV1 } from "../src/index.js";

const SERVER_FUNCTION_METADATA = Symbol.for("solid.ServerFunctionMetadata");

let nextId = 0;
/** Brand `fn` as a server function reference (what compiled `"use server"` output produces). */
function serverFunction<F extends (...args: any[]) => any>(fn: F): F & { id: string } {
  const branded = fn as F & { id: string };
  branded.id = "srv#" + nextId++;
  (branded as any)[SERVER_FUNCTION_METADATA] = {};
  return branded;
}

const settle = async (ms = 0) => {
  await new Promise<void>(resolve => queueMicrotask(() => resolve()));
  await new Promise(resolve => setTimeout(resolve, ms));
};

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

/** A minimal Standard Schema: `page` as a number, defaulting to 1. */
const pageSchema: StandardSchemaV1<{ page?: string }, { page: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: any) => ({ value: { page: Number(value?.page) || 1 } })
  }
};

describe("server component routes", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("renders the resolved server component with the outlet in its children position", async () => {
    const userLayout = serverFunction(async ({ params }: ServerRouteArgs<{ id: string }>) => {
      return (props: { children?: any }) => (
        <section data-layout={params.id}>
          <h1>User {params.id}</h1>
          {props.children}
        </section>
      );
    });

    const Router = createRouter({
      routes: [
        defineRoute({
          path: "/users/:id",
          component: serverRouteComponent(query(userLayout, "layout-a")),
          children: [
            defineRoute({ path: "/", component: () => <p data-leaf>profile</p> }),
            defineRoute({
              path: "/posts/:postId",
              component: props => <p data-leaf>post {props.params.postId}</p>
            })
          ]
        })
      ],
      history: memoryHistory("/users/7")
    });

    const { div, cleanup } = mount(() => (
      <Router>{props => <Loading fallback="loading">{props.children}</Loading>}</Router>
    ));
    await settle();
    expect(div.querySelector("[data-layout]")!.getAttribute("data-layout")).toBe("7");
    expect(div.querySelector("h1")!.textContent).toBe("User 7");
    expect(div.querySelector("[data-leaf]")!.textContent).toBe("profile");
    cleanup();
  });

  test("is called with this level's params only, and re-called only when they change", async () => {
    const calls: ServerRouteArgs<any, any>[] = [];
    const userLayout = serverFunction(async (args: ServerRouteArgs<{ id: string }>) => {
      calls.push(args);
      return (props: { children?: any }) => (
        <section data-layout={args.params.id}>{props.children}</section>
      );
    });
    let navigate!: Navigator;
    const Leaf = (props: any) => {
      navigate = useNavigate();
      return <p data-leaf>{props.params.postId || "profile"}</p>;
    };

    const Router = createRouter({
      routes: [
        defineRoute({
          path: "/users/:id",
          component: serverRouteComponent(query(userLayout, "layout-b")),
          children: [
            defineRoute({ path: "/", component: Leaf }),
            defineRoute({ path: "/posts/:postId", component: Leaf })
          ]
        })
      ],
      history: memoryHistory("/users/7")
    });

    const { div, cleanup } = mount(() => (
      <Router>{props => <Loading fallback="loading">{props.children}</Loading>}</Router>
    ));
    await settle();
    expect(calls).toEqual([{ params: { id: "7" }, search: undefined }]);

    // A child param change is not this level's business: no re-call.
    navigate("/users/7/posts/42");
    await settle(20);
    expect(div.querySelector("[data-leaf]")!.textContent).toBe("42");
    expect(calls.length).toBe(1);

    // A query-string change is not either — the route declared no `search`.
    navigate("/users/7/posts/42?tab=x");
    await settle(20);
    expect(calls.length).toBe(1);

    // This level's param changing re-derives the call.
    navigate("/users/8/posts/42");
    await settle(20);
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual({ params: { id: "8" }, search: undefined });
    expect(div.querySelector("[data-layout]")!.getAttribute("data-layout")).toBe("8");
    cleanup();
  });

  test("includes the validated `search` output only when the route declares a schema", async () => {
    const calls: ServerRouteArgs<any, any>[] = [];
    const list = serverFunction(async (args: ServerRouteArgs<{}, { page: number }>) => {
      calls.push(args);
      return () => <ul data-page={args.search.page} />;
    });
    let navigate!: Navigator;
    const Router = createRouter({
      routes: [
        defineRoute({
          path: "/list",
          component: serverRouteComponent(query(list, "list")),
          search: pageSchema
        }),
        defineRoute({
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <p>home</p>;
          }
        })
      ],
      history: memoryHistory("/")
    });

    const { div, cleanup } = mount(() => (
      <Router>{props => <Loading fallback="loading">{props.children}</Loading>}</Router>
    ));
    await settle();
    navigate("/list");
    await settle(20);
    expect(calls).toEqual([{ params: {}, search: { page: 1 } }]);
    expect(div.querySelector("[data-page]")!.getAttribute("data-page")).toBe("1");

    navigate("/list?page=3");
    await settle(20);
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual({ params: {}, search: { page: 3 } });
    expect(div.querySelector("[data-page]")!.getAttribute("data-page")).toBe("3");

    // Same validated output → same call, no refetch (the raw string changed,
    // the schema output did not).
    navigate("/list?page=3&other=1");
    await settle(20);
    expect(calls.length).toBe(2);
    cleanup();
  });

  test("hover preload warms the same call the navigation reads", async () => {
    const fn = vi.fn(async ({ params }: ServerRouteArgs<{ id: string }>) => {
      return () => <article data-story={params.id} />;
    });
    const story = serverFunction(fn);
    let navigate!: Navigator;
    let preload!: ReturnType<typeof usePreloadRoute>;
    const Router = createRouter({
      routes: [
        defineRoute({
          path: "/stories/:id",
          component: serverRouteComponent(query(story, "story"))
        }),
        defineRoute({
          path: "/",
          component: () => {
            navigate = useNavigate();
            preload = usePreloadRoute();
            return <p>home</p>;
          }
        })
      ],
      history: memoryHistory("/")
    });

    const { div, cleanup } = mount(() => (
      <Router>{props => <Loading fallback="loading">{props.children}</Loading>}</Router>
    ));
    await settle();
    preload("/stories/5", { preloadData: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual({ params: { id: "5" }, search: undefined });

    navigate("/stories/5");
    await settle(20);
    expect(div.querySelector("[data-story]")!.getAttribute("data-story")).toBe("5");
    // the navigation read the preloaded entry
    expect(fn).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test("the key is the app's: `revalidate(key)` refetches the route", async () => {
    let version = 0;
    const fn = vi.fn(async ({ params }: ServerRouteArgs<{ id: string }>) => {
      const v = ++version;
      return () => <article data-story={params.id} data-version={v} />;
    });
    const Router = createRouter({
      routes: [
        defineRoute({
          path: "/stories/:id",
          component: serverRouteComponent(query(serverFunction(fn), "story-rv"))
        })
      ],
      history: memoryHistory("/stories/5")
    });

    const { div, cleanup } = mount(() => (
      <Router>{props => <Loading fallback="loading">{props.children}</Loading>}</Router>
    ));
    await settle();
    expect(div.querySelector("[data-version]")!.getAttribute("data-version")).toBe("1");
    expect(fn).toHaveBeenCalledTimes(1);

    revalidate("story-rv");
    await settle(20);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1][0]).toEqual({ params: { id: "5" }, search: undefined });
    expect(div.querySelector("[data-version]")!.getAttribute("data-version")).toBe("2");
    cleanup();
  });

  test("mounted directly rather than as a route component, it refuses", () => {
    // Outside the core there are only merged params to call with — the same
    // view under a second address. The brand is the only supported mount.
    const story = serverFunction(async (_args: ServerRouteArgs<{ id: string }>) => () => <p />);
    const Direct = serverRouteComponent(query(story, "story-direct"));
    expect(() => (Direct as any)({ params: { id: "1" } })).toThrow(/mount it as a route/);
  });

  test("a plain client component route is untouched", async () => {
    const Client = vi.fn((props: any) => <p data-client>{props.params.id}</p>);
    const Router = createRouter({
      routes: [defineRoute({ path: "/x/:id", component: Client })],
      history: memoryHistory("/x/1")
    });
    const { div, cleanup } = mount(() => <Router>{props => props.children}</Router>);
    await settle();
    expect(div.querySelector("[data-client]")!.textContent).toBe("1");
    expect(Client).toHaveBeenCalledTimes(1);
    expect(Client.mock.calls[0][0]).toHaveProperty("location");
    cleanup();
  });

  test("Router.keysFor names the server routes a URL shows, root to leaf", () => {
    // What a server action narrows `revalidate` to — route keys, the app's
    // own, so the action never spells a key or reproduces derived args.
    const shell = serverFunction(async () => (props: any) => props.children);
    const story = serverFunction(async (_args: ServerRouteArgs<{ id: string }>) => () => <p />);
    const Router = createRouter({
      routes: [
        {
          component: serverRouteComponent(query(shell, "shell-keys")),
          children: [
            defineRoute({ path: "/", component: () => <p /> }),
            defineRoute({
              path: "/stories/:id",
              component: serverRouteComponent(query(story, "story-keys")),
              children: [
                defineRoute({ path: "/", component: () => <p /> }),
                defineRoute({ path: "/comments", component: () => <p /> })
              ]
            })
          ]
        }
      ]
    });

    expect(Router.keysFor("/stories/7")).toEqual(["shell-keys", "story-keys"]);
    // a paths node, bound or not, is accepted; a full URL too
    expect(Router.keysFor(Router.paths.stories(7))).toEqual(["shell-keys", "story-keys"]);
    expect(Router.keysFor("https://app.test/stories/7/comments?x=1")).toEqual([
      "shell-keys",
      "story-keys"
    ]);
    // client-only levels contribute nothing; the shell is still on the chain
    expect(Router.keysFor(Router.paths())).toEqual(["shell-keys"]);
    // no match: nothing to name
    expect(Router.keysFor("/nowhere")).toEqual([]);
  });
});
