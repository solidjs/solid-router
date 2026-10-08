// Observe tier: every client location write is declared to solid's
// attribution engine as a navigation (`OBSERVE.attribution.withOrigin`), so
// holds and re-runs it causes are named after the route, redirect hops fold
// onto the navigation they belong to, and a lazy subtree that resolved during
// the hold names the exact route it landed on. Nothing here exists in the
// production build: `OBSERVE` is undefined there and the declaration folds out.
import { createMemo, createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { attribution, feedback } from "solid-js/attribution";
import { vi } from "vitest";
import {
  action,
  createRouter,
  defineRoutes,
  memoryHistory,
  query,
  useNavigate,
  useParams,
  useSubmissions
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

const last = () => attribution.history("navigation")[attribution.history("navigation").length - 1];

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

  test("mounting declares the route the document arrived on — the first record, initial", () => {
    const Router = createRouter({
      routes: [
        { path: "/", component: () => <div data-route="home">Home</div> },
        {
          path: "/users/:id",
          component: () => {
            const params = useParams();
            return <div data-route="user">{params.id}</div>;
          }
        }
      ] as const,
      history: memoryHistory("/users/42?tab=posts")
    });
    const before = attribution.history("navigation").length;
    const { div, cleanup } = mount(Router);
    try {
      expect(div.querySelector('[data-route="user"]')?.textContent).toBe("42");
      // Delivered as the router finished building its context: no write to
      // wait for, so the record settled at frame close.
      expect(attribution.history("navigation").length).toBe(before + 1);
      const nav = last();
      expect(nav.initial).toBe(true);
      expect(nav.name).toBe("/users/:id");
      expect(nav.to).toBe("/users/42?tab=posts");
      expect(nav.params).toEqual({ id: "42" });
      expect(nav.from).toBeUndefined();
      expect(nav.interaction).toBeUndefined();
      // The document's own navigation start on the performance clock.
      expect(nav.at).toBe(0);
      expect(nav.writes).toBe(0);
      expect(nav.outcome).toBe("committed");
    } finally {
      cleanup();
    }
  });

  test("an empty arrival normalized onto the base path is one initial record, not a navigation", async () => {
    // A hash history with no hash, a memory history seeded with "": the
    // router moves the empty location onto the base. That write is the
    // arrival's, not a navigation's — it stamps the initial frame, and the
    // record reads the normalized location when it settles.
    const Router = createRouter({
      base: "/app",
      routes: [
        { path: "/", component: () => <div data-route="home">Home</div> },
        { path: "/about", component: () => <div data-route="about">About</div> }
      ] as const,
      history: memoryHistory("")
    });
    const before = attribution.history("navigation").length;
    const { div, cleanup } = mount(Router);
    try {
      await settle();
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
      expect(attribution.history("navigation").length).toBe(before + 1);
      const nav = last();
      expect(nav.initial).toBe(true);
      expect(nav.to).toBe("/app");
      expect(nav.name).toBe("/app");
      expect(nav.writes).toBe(1);
      expect(nav.outcome).toBe("committed");
      expect(nav.redirects).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test("the initial declaration is not a row in feedback().navigations", async () => {
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
        { path: "/about", component: () => <div data-route="about">About</div> }
      ] as const,
      history: memoryHistory()
    });
    const { cleanup } = mount(Router);
    try {
      expect(last().initial).toBe(true);
      navigate("/about");
      await settle();
      const rows = feedback().navigations;
      expect(rows.map(r => r.name)).toEqual(["/about"]);
      expect(rows[0].navigations).toBe(1);
    } finally {
      cleanup();
    }
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
      const before = attribution.history("navigation").length;
      navigate("/users/42");
      await settle();
      expect(div.querySelector('[data-route="user"]')?.textContent).toBe("42");

      expect(attribution.history("navigation").length).toBe(before + 1);
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
      const before = attribution.history("navigation").length;
      navigate("/files");
      await settle(60);
      expect(div.querySelector('[data-route="login"]')).toBeTruthy();

      // one navigation, two writes, the abandoned destination recorded as a hop
      expect(attribution.history("navigation").length).toBe(before + 1);
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

  test("a guard that navigates as the held destination lands is a hop of that navigation, not a new one", async () => {
    let navigate!: Navigator;
    const getSession = query(async () => {
      await new Promise(r => setTimeout(r, 10));
      return { authed: false };
    }, "observe-session");
    // The app-authored guard: read the session (held), then redirect in
    // render once it lands. /private never reaches history.
    const Private = () => {
      const session = createMemo(() => getSession());
      const nav = useNavigate();
      const view = createMemo(() => {
        if (!session().authed) {
          nav("/login", { replace: true });
          return null;
        }
        return <span data-route="private">private</span>;
      });
      return <>{view()}</>;
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
        { path: "/private", component: Private },
        { path: "/login", component: () => <span data-route="login">login-page</span> }
      ] as const,
      history: memoryHistory()
    });

    const { div, cleanup } = mount(Router);
    try {
      const before = attribution.history("navigation").length;
      navigate("/private");
      await settle(60);
      expect(div.querySelector('[data-route="login"]')).toBeTruthy();

      expect(attribution.history("navigation").length).toBe(before + 1);
      const nav = last();
      expect(nav.name).toBe("/login");
      expect(nav.from).toBe("/");
      expect(nav.writes).toBe(2);
      expect(nav.redirects?.map(h => h.to)).toEqual(["/private"]);
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

      const before = attribution.history("navigation").length;
      history.go(-1);
      await settle();
      expect(div.querySelector('[data-route="home"]')).toBeTruthy();
      expect(attribution.history("navigation").length).toBe(before + 1);
      const nav = last();
      expect(nav.name).toBe("/");
      expect(nav.from).toBe("/users/1");
      expect(nav.redirects).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

// #643: the router's `document` click and submit listeners run inside the
// interaction frame the web runtime opens for the same event
// (`dispatchAsInteraction`), so a link click or a native form submit is one
// interaction record carrying the navigation or the action, beside whatever
// component handlers ran for that event.
describe("observe tier: native link clicks and form submits are interactions (#643)", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
    attribution.enable({ log: false });
  });
  afterEach(() => attribution.disable());
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  const interactionsSince = (n: number) => attribution.history("interaction").slice(n);

  test("an anchor click is the navigation's interaction", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => (
            <a id="to-user" href="/users/6">
              user
            </a>
          )
        },
        { path: "/users/:id", component: () => <div data-route="user">user</div> }
      ] as const,
      history: memoryHistory()
    });
    const { div, cleanup } = mount(Router);
    try {
      const interactions = attribution.history("interaction").length;
      const navigations = attribution.history("navigation").length;
      div.querySelector<HTMLAnchorElement>("#to-user")!.click();
      await settle();
      expect(div.querySelector('[data-route="user"]')).toBeTruthy();

      expect(attribution.history("navigation").length).toBe(navigations + 1);
      const nav = last();
      expect(nav.name).toBe("/users/:id");
      const clicks = interactionsSince(interactions).filter(i => i.name === "click");
      expect(clicks).toHaveLength(1);
      expect(clicks[0].target).toMatch(/^a#to-user/);
      expect(nav.interaction).toBe(clicks[0].origin);
      expect(clicks[0].navigations.map(n => n.origin)).toEqual([nav.origin]);
    } finally {
      cleanup();
    }
  });

  test("a component onClick on the anchor and the navigation are one interaction", async () => {
    const [count, setCount] = createSignal(0, { ownedWrite: true });
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => (
            <a id="to-user" href="/users/6" onClick={() => setCount(c => c + 1)}>
              user {count()}
            </a>
          )
        },
        { path: "/users/:id", component: () => <div data-route="user">user</div> }
      ] as const,
      history: memoryHistory()
    });
    const { div, cleanup } = mount(Router);
    try {
      const interactions = attribution.history("interaction").length;
      div.querySelector<HTMLAnchorElement>("#to-user")!.click();
      await settle();
      expect(div.querySelector('[data-route="user"]')).toBeTruthy();

      const clicks = interactionsSince(interactions).filter(i => i.name === "click");
      expect(clicks).toHaveLength(1);
      expect(last().interaction).toBe(clicks[0].origin);
      // the handler's write and the navigation's location write
      expect(clicks[0].writes).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  test("a component onClick that prevents default still stops the navigation", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => (
            <a id="to-user" href="/users/6" onClick={e => e.preventDefault()}>
              user
            </a>
          )
        },
        { path: "/users/:id", component: () => <div data-route="user">user</div> }
      ] as const,
      history: memoryHistory()
    });
    const { div, cleanup } = mount(Router);
    try {
      const navigations = attribution.history("navigation").length;
      div.querySelector<HTMLAnchorElement>("#to-user")!.click();
      await settle();
      expect(div.querySelector('[data-route="user"]')).toBeNull();
      expect(attribution.history("navigation").length).toBe(navigations);
    } finally {
      cleanup();
    }
  });

  test("a native form submit to an action is the action's interaction", async () => {
    const [saves, setSaves] = createSignal(0, { ownedWrite: true });
    const save = action(async (_form: FormData) => {
      setSaves(n => n + 1);
      return "saved";
    }, "observe-643-save");
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => {
            const subs = useSubmissions(save);
            return (
              <form id="save" action={save} method="post">
                <output>{subs.length}</output>
                <span>{saves()}</span>
                <button type="submit">save</button>
              </form>
            );
          }
        }
      ] as const,
      history: memoryHistory()
    });
    const { div, cleanup } = mount(Router);
    try {
      const interactions = attribution.history("interaction").length;
      const holds = attribution.history("hold").length;
      div.querySelector<HTMLFormElement>("#save")!.requestSubmit();
      await settle(10);
      expect(div.querySelector("output")!.textContent).toBe("1");

      const submits = interactionsSince(interactions).filter(i => i.name === "submit");
      expect(submits).toHaveLength(1);
      expect(submits[0].target).toMatch(/^form#save/);
      // the action body's write (plus its default revalidation's, when other
      // queries are cached), and the transition it held, are the submit's
      expect(submits[0].writes).toBeGreaterThanOrEqual(1);
      const actionHolds = attribution.history("hold").slice(holds);
      expect(actionHolds.length).toBeGreaterThan(0);
      expect(actionHolds.every(h => h.interaction === submits[0].origin)).toBe(true);
    } finally {
      cleanup();
    }
  });
});
