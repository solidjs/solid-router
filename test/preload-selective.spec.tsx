// @vitest-environment jsdom
// A hover preloads what the hover could change. Navigation reuses a level
// whose route matches (its `preload` does not re-run; components re-read
// through tracked params), so hover runs a level's data preload only when
// navigation would mount it fresh or reuse it with changed inputs: this
// level's params, and search as the declared schema's output — or the raw
// string when the route declares none.
import { vi } from "vitest";
import { render } from "@solidjs/web";
import {
  createRouter,
  defineRoute,
  memoryHistory,
  query,
  serverRouteComponent,
  usePreloadRoute
} from "../src/index.js";
import type { ServerRouteArgs, StandardSchemaV1 } from "../src/index.js";

const settle = () => new Promise(r => setTimeout(r, 0));

const pageSchema: StandardSchemaV1<{ page?: string }, { page: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (v: any) => ({ value: { page: Number(v?.page) || 1 } })
  }
};

function setup(initial: string) {
  const shell = vi.fn();
  const users = vi.fn();
  const user = vi.fn();
  const list = vi.fn();
  const tabs = vi.fn();
  const storyFn = vi.fn(async ({ params }: ServerRouteArgs<{ id: string }>) => () => (
    <i>{params.id}</i>
  ));
  let preload!: ReturnType<typeof usePreloadRoute>;
  const Shell = (props: any) => {
    preload = usePreloadRoute();
    return props.children;
  };
  const Home = () => <p>home</p>;
  const Leaf = () => <p>leaf</p>;
  const Router = createRouter({
    routes: [
      {
        component: Shell,
        preload: shell,
        children: [
          defineRoute({ path: "/", component: Home }),
          defineRoute({
            path: "/users/:id",
            preload: users,
            children: [
              defineRoute({ path: "/", component: Leaf }),
              defineRoute({ path: "/posts", preload: user, component: Leaf })
            ]
          }),
          defineRoute({ path: "/list", preload: list, search: pageSchema, component: Leaf }),
          defineRoute({ path: "/tabs", preload: tabs, component: Leaf }),
          defineRoute({
            path: "/stories/:id",
            component: serverRouteComponent(query(storyFn, "story-" + initial))
          })
        ]
      }
    ],
    history: memoryHistory(initial)
  });
  const div = document.createElement("div");
  document.body.appendChild(div);
  const dispose = render(() => <Router>{p => p.children}</Router>, div);
  return {
    shell,
    users,
    user,
    list,
    tabs,
    storyFn,
    preload: (to: string) => preload(to, { preloadData: true }),
    cleanup() {
      dispose();
      div.remove();
    }
  };
}

describe("selective hover preload", () => {
  test("levels navigation would reuse unchanged are skipped; new levels run", async () => {
    const t = setup("/");
    await settle();
    expect(t.shell).toHaveBeenCalledTimes(1); // mount
    t.preload("/users/7");
    expect(t.shell).toHaveBeenCalledTimes(1); // shared, unchanged: not re-run
    expect(t.users).toHaveBeenCalledTimes(1); // new level
    expect(t.users.mock.calls[0][0].params).toEqual({ id: "7" });
    t.cleanup();
  });

  test("a reused level with changed params re-runs; its unchanged ancestors do not", async () => {
    const t = setup("/users/7/posts");
    await settle();
    expect(t.users).toHaveBeenCalledTimes(1);
    expect(t.user).toHaveBeenCalledTimes(1);
    t.preload("/users/8/posts");
    expect(t.shell).toHaveBeenCalledTimes(1);
    expect(t.users).toHaveBeenCalledTimes(2); // this level's param changed
    expect(t.users.mock.calls[1][0].params).toEqual({ id: "8" });
    expect(t.user).toHaveBeenCalledTimes(2); // params are cumulative: the leaf's changed too
    t.preload("/users/7/posts"); // the current location: nothing changed
    expect(t.users).toHaveBeenCalledTimes(2);
    expect(t.user).toHaveBeenCalledTimes(2);
    t.cleanup();
  });

  test("search: raw string without a schema, validated output with one", async () => {
    const t = setup("/tabs");
    await settle();
    expect(t.tabs).toHaveBeenCalledTimes(1);
    t.preload("/tabs?tab=x"); // no schema: any query change is a change
    expect(t.tabs).toHaveBeenCalledTimes(2);
    t.preload("/tabs"); // back to the current search: unchanged
    expect(t.tabs).toHaveBeenCalledTimes(2);
    t.cleanup();

    const s = setup("/list?page=2");
    await settle();
    expect(s.list).toHaveBeenCalledTimes(1);
    s.preload("/list?page=2&other=1"); // schema output identical: skipped
    expect(s.list).toHaveBeenCalledTimes(1);
    s.preload("/list?page=3"); // output changed: runs
    expect(s.list).toHaveBeenCalledTimes(2);
    s.cleanup();
  });

  test("a server route's source is not re-called for an unchanged address", async () => {
    const t = setup("/stories/5");
    await settle();
    expect(t.storyFn).toHaveBeenCalledTimes(1);
    t.preload("/stories/5");
    expect(t.storyFn).toHaveBeenCalledTimes(1);
    t.preload("/stories/6");
    expect(t.storyFn).toHaveBeenCalledTimes(2);
    t.cleanup();
  });
});
