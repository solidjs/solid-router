/**
 * Characterization of the router's navigation-pending state (#655): every
 * observable that today derives from `isPending`/`latest` of the location —
 * `useIsRouting`, the in-flight target, `useLinkState().pending`,
 * `data-pending` on claimed anchors (through `pendingLinks`), the intent `query` and preloads see, the redirect hop
 * rules — and scroll restoration's timing, recorded as one ordered timeline
 * per scenario. These pin current behavior so a different mechanism can be
 * checked against it moment by moment, not just at rest.
 *
 * Log vocabulary:
 * - `routing:<bool>[@target]` — `useIsRouting()` changed (render effect),
 *   with the in-flight link target read beside it (`pendingTarget`, the
 *   helper `useLinkState` and `pendingLinks` share)
 * - `link:<href>:<bool>` — `useLinkState(href).pending` changed
 * - `attr:<href>:+|-` — `data-pending` set/removed on a claimed anchor
 * - `fetch:<id>:<intent>` — a `query` fetcher ran, with the intent it saw
 * - `preload:<id>:<intent>` — a route preload ran
 * - `scrollTo:<y>` — the router scrolled the window
 * - `| <checkpoint> …` — a step boundary, with the state an event handler
 *   reads at that moment (outside the graph, untracked)
 */
import { render } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createRenderEffect,
  Errored,
  flush,
  lazy,
  Loading,
  NotReadyError,
  untrack,
  type ParentProps
} from "solid-js";
import { vi } from "vitest";
import {
  createRouter,
  pendingLinks,
  query,
  useBeforeLeave,
  useIsRouting,
  useLinkState,
  useNavigate,
  useParams,
  useSearchParams,
  type Navigator
} from "../src/index.js";
import { pendingTarget, routingState } from "../src/pending.js";
import { getIntent, useRouter } from "../src/routing.js";
import type { RouterContext } from "../src/types.js";

const settle = async (ms = 5) => {
  await new Promise<void>(resolve => queueMicrotask(resolve));
  await new Promise(resolve => setTimeout(resolve, ms));
};

type Gate = {
  promise: Promise<string>;
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
};
let instance = 0;

type Options = {
  /** wrap the route outlet in `<Errored>`, logging `caught:<message>` */
  errored?: boolean;
  /** log the intent render and user effects over the location see when they run */
  landingProbe?: boolean;
  /** log what the page shows (a route, the loading fallback) at each `scrollTo` */
  scrollProbe?: boolean;
  /** wrap the router in `<Loading>`, as an app resolving a lazy subtree on arrival does */
  outerLoading?: boolean;
};

function harness(initial = "/", options: Options = {}) {
  const log: string[] = [];
  const gates = new Map<string, Gate>();
  const gate = (id: string) => {
    let g = gates.get(id);
    if (!g) {
      let resolve!: (v: string) => void, reject!: (e: unknown) => void;
      const promise = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
      gates.set(id, (g = { promise, resolve, reject }));
    }
    return g;
  };

  const proto = Element.prototype;
  const { setAttribute, removeAttribute } = proto;
  proto.setAttribute = function (this: Element, name: string, value: string) {
    if (name === "data-pending" && !this.hasAttribute(name))
      log.push(`attr:${this.getAttribute("href")}:+`);
    return setAttribute.call(this, name, value);
  };
  proto.removeAttribute = function (this: Element, name: string) {
    if (name === "data-pending" && this.hasAttribute(name))
      log.push(`attr:${this.getAttribute("href")}:-`);
    return removeAttribute.call(this, name);
  };
  let y = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
  window.scrollTo = ((_x: number, newY: number) => {
    y = newY;
    log.push(`scrollTo:${newY}` + (options.scrollProbe ? ` shows=${shows()}` : ""));
    window.dispatchEvent(new Event("scroll"));
  }) as any;

  const key = `nav-pending-${++instance}`;
  const getData = query(async (id: string) => {
    log.push(`fetch:${id}:${untrack(getIntent) ?? "-"}`);
    return gate(id).promise;
  }, `${key}-data`);
  const getHop = query(async (n: number) => {
    log.push(`hop:${n}:${untrack(getIntent) ?? "-"}`);
    if (n > 0) throw new Response(null, { status: 302, headers: { Location: `/hop/${n - 1}` } });
    return "landed";
  }, `${key}-hop`);

  let navigate!: Navigator;
  let router!: RouterContext;
  let blockLeave = false;

  const Slow = () => {
    const params = useParams<{ id: string }>();
    const data = createMemo(() => getData(params.id));
    return <div data-route="slow">{data()}</div>;
  };
  // uncached: every visit (a pop included) waits on its own gate
  const visits = new Map<string, number>();
  const Fresh = () => {
    const params = useParams<{ id: string }>();
    const data = createMemo(() => {
      const visit = `${params.id}#${(visits.get(params.id) ?? 0) + 1}`;
      visits.set(params.id, (visits.get(params.id) ?? 0) + 1);
      log.push(`fresh:${visit}`);
      return gate(visit).promise;
    });
    return <div data-route="fresh">{data()}</div>;
  };
  const Hop = () => {
    const params = useParams<{ n: string }>();
    const data = createMemo(() => getHop(Number(params.n)));
    return <div data-route="hop">{data()}</div>;
  };
  const Guarded = () => {
    useBeforeLeave(e => {
      if (blockLeave) {
        log.push(`blocked:${e.to}`);
        e.preventDefault();
      }
    });
    return <div data-route="guarded" />;
  };
  // a guard that never blocks: logs the destination it is asked about
  let setSearch!: (params: Record<string, string>) => void;
  const Watched = () => {
    const [, set] = useSearchParams();
    setSearch = set as any;
    useBeforeLeave(e => void log.push(`leave:${e.to}`));
    return <div data-route="watched" />;
  };
  const page = (name: string) => () => <div data-route={name} />;

  const links = ["/", "/a", "/slow/1", "/slow/2"];
  const Layout = (props: ParentProps) => {
    navigate = useNavigate();
    router = useRouter();
    const isRouting = useIsRouting();
    let prevRouting: string | undefined;
    createRenderEffect(
      () => {
        const routing = isRouting();
        const target = pendingTarget(router)?.value;
        return `routing:${routing}${target ? `@${target}` : ""}`;
      },
      v => {
        if (v !== prevRouting) log.push(v);
        prevRouting = v;
      }
    );
    if (options.landingProbe) {
      createRenderEffect(
        () => `${router.location.pathname}:${untrack(getIntent) ?? "-"}`,
        v => void log.push(`render-intent:${v}`)
      );
      createEffect(
        () => `${router.location.pathname}:${untrack(getIntent) ?? "-"}`,
        v => void log.push(`user-intent:${v}`)
      );
    }
    for (const href of links) {
      const state = useLinkState(() => href);
      let prev = false;
      createRenderEffect(state.pending, p => {
        if (p !== prev) log.push(`link:${href}:${p}`);
        prev = p;
      });
    }
    return (
      <>
        {links.map(href => (
          <a href={href}>{href}</a>
        ))}
        <Loading fallback={<div data-loading />}>
          {options.errored ? (
            <Errored
              fallback={(e: any) => {
                log.push(`caught:${e()?.message ?? e()}`);
                return <div data-route="error" />;
              }}
            >
              {props.children}
            </Errored>
          ) : (
            props.children
          )}
        </Loading>
      </>
    );
  };

  // a push truncates forward entries an earlier test left, so the depth
  // stamp of the starting entry is its real index
  window.history.pushState(null, "", initial);
  const Router = createRouter({
    routes: [
      { path: "/", component: page("home") },
      { path: "/a", component: page("a") },
      { path: "/b", component: page("b") },
      {
        path: "/slow/:id",
        preload: ({ params, intent }: any) => void log.push(`preload:${params.id}:${intent}`),
        component: Slow
      },
      { path: "/fresh/:id", component: Fresh },
      { path: "/hop/:n", component: Hop },
      { path: "/guarded", component: Guarded },
      { path: "/watched", component: Watched },
      {
        path: "/lazy",
        component: lazy(() => gate("lazy").promise.then(() => ({ default: page("lazy") })))
      },
      {
        path: "/tree",
        children: (() =>
          gate("tree").promise.then(() => ({
            default: [{ path: "/", component: page("tree") }]
          }))) as any
      }
    ] as const,
    links: pendingLinks
  });
  const div = document.createElement("div");
  const shows = () =>
    div.querySelector("[data-route]")?.getAttribute("data-route") ??
    (div.querySelector("[data-loading]") ? "loading" : "-");
  document.body.appendChild(div);
  const app = () => <Router>{(props: ParentProps) => <Layout {...props} />}</Router>;
  const dispose = render(
    options.outerLoading ? () => <Loading fallback={<div data-loading />}>{app()}</Loading> : app,
    div
  );

  const mark = (label: string) =>
    untrack(() => {
      // pending state over a still-resolving lazy route subtree is not
      // readable from outside the graph yet
      let state: string;
      try {
        const target = pendingTarget(router)?.value;
        state = `routing=${routingState(router)()}` + (target ? ` target=${target}` : "");
      } catch (e) {
        if (!(e instanceof NotReadyError)) throw e;
        state = "routing=<not ready>";
      }
      const intent = router.intent?.();
      log.push(
        `| ${label} ${state}` +
          (intent ? ` intent=${intent}` : "") +
          ` at=${router.location.pathname}`
      );
    });

  return {
    log,
    gate,
    navigate: (to: string, options?: any) => navigate(to, options),
    setSearch: (params: Record<string, string>) => setSearch(params),
    route: () => div.querySelector("[data-route]")?.getAttribute("data-route"),
    block: (on: boolean) => (blockLeave = on),
    mark,
    /** Run `fn`, then checkpoint after the call, after `flush()` and after a macrotask. */
    async step(label: string, fn: () => void) {
      fn();
      mark(`${label}: call`);
      flush();
      mark(`${label}: flush`);
      await settle();
      mark(`${label}: settled`);
    },
    async wait(label: string) {
      await settle();
      mark(label);
    },
    /**
     * Traverse history, then checkpoint like `wait` once `pops` popstate
     * events arrived — jsdom delivers them in a later task, which a loaded
     * run can push past a fixed wait. A blocked pop is two: the traversal
     * and the router's revert.
     */
    async traverse(label: string, go: () => void, pops = 1) {
      await new Promise<void>(resolve => {
        let seen = 0;
        const onPop = () => {
          if (++seen < pops) return;
          window.removeEventListener("popstate", onPop);
          resolve();
        };
        window.addEventListener("popstate", onPop);
        go();
      });
      await settle();
      mark(label);
    },
    reset() {
      log.length = 0;
    },
    cleanup() {
      dispose();
      div.remove();
      proto.setAttribute = setAttribute;
      proto.removeAttribute = removeAttribute;
      // a held navigation may still land after the app is gone
      window.scrollTo = (() => {}) as any;
    }
  };
}

describe("navigation pending state (characterization, #655)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("sync navigation", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /a", () => h.navigate("/a"));
      expect(h.route()).toBe("a");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /a: call routing=false at=/",
          "routing:true@/a",
          "routing:false",
          "scrollTo:0",
          "| navigate /a: flush routing=false at=/a",
          "| navigate /a: settled routing=false at=/a",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("async navigation", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      h.gate("1").resolve("one");
      await h.wait("resolved");
      expect(h.route()).toBe("slow");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "attr:/slow/1:-",
          "routing:false",
          "link:/slow/1:false",
          "scrollTo:0",
          "| resolved routing=false at=/slow/1",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("navigation superseded mid-flight by another async one (A then B)", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      await h.step("navigate /slow/2", () => h.navigate("/slow/2"));
      h.gate("1").resolve("one");
      await h.wait("resolved 1");
      h.gate("2").resolve("two");
      await h.wait("resolved 2");
      expect(window.location.pathname).toBe("/slow/2");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/2: call routing=true target=/slow/1 intent=navigate at=/",
          "fetch:2:navigate",
          "routing:true@/slow/2",
          "link:/slow/1:false",
          "link:/slow/2:true",
          "| navigate /slow/2: flush routing=true target=/slow/2 intent=navigate at=/",
          "| navigate /slow/2: settled routing=true target=/slow/2 intent=navigate at=/",
          "| resolved 1 routing=true target=/slow/2 intent=navigate at=/",
          "attr:/slow/1:-",
          "attr:/slow/2:+",
          "attr:/slow/2:-",
          "routing:false",
          "link:/slow/2:false",
          "scrollTo:0",
          "| resolved 2 routing=false at=/slow/2",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("navigation superseded mid-flight by a sync one", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      await h.step("navigate /a", () => h.navigate("/a"));
      expect(window.location.pathname).toBe("/a");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /a: call routing=true target=/slow/1 intent=navigate at=/",
          "routing:true@/a",
          "link:/a:true",
          "link:/slow/1:false",
          "attr:/a:+",
          "attr:/slow/1:-",
          "attr:/a:-",
          "routing:false",
          "link:/a:false",
          "scrollTo:0",
          "| navigate /a: flush routing=false at=/a",
          "| navigate /a: settled routing=false at=/a",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("navigating back to the current location while pending", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      await h.step("navigate /", () => h.navigate("/"));
      h.gate("1").resolve("one");
      await h.wait("resolved 1");
      expect(window.location.pathname).toBe("/");
      expect(h.route()).toBe("home");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /: call routing=true target=/slow/1 intent=navigate at=/",
          "routing:true@/",
          "link:/:true",
          "link:/slow/1:false",
          "attr:/:+",
          "attr:/slow/1:-",
          "attr:/:-",
          "routing:false",
          "link:/:false",
          "scrollTo:0",
          "| navigate /: flush routing=false at=/",
          "| navigate /: settled routing=false at=/",
          "| resolved 1 routing=false at=/",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("re-navigating to the pending target is a no-op", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      await h.step("navigate /slow/1 again", () => h.navigate("/slow/1"));
      h.gate("1").resolve("one");
      await h.wait("resolved");
      expect(window.history.length).toBeGreaterThan(0);
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1 again: call routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1 again: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1 again: settled routing=true target=/slow/1 intent=navigate at=/",
          "attr:/slow/1:-",
          "routing:false",
          "link:/slow/1:false",
          "scrollTo:0",
          "| resolved routing=false at=/slow/1",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("a redirect chain from queries lands on the final hop", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      const length = window.history.length;
      h.reset();
      await h.step("navigate /hop/3", () => h.navigate("/hop/3"));
      await h.wait("hops done");
      await h.wait("hops done 2");
      expect(window.location.pathname).toBe("/hop/0");
      // the hops inherit the first write's history policy: one push in all
      expect(window.history.length).toBe(length + 1);
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /hop/3: call routing=false at=/",
          "hop:3:navigate",
          "routing:true@/hop/3",
          "| navigate /hop/3: flush routing=true target=/hop/3 intent=navigate at=/",
          "hop:2:navigate",
          "routing:true@/hop/2",
          "hop:1:navigate",
          "routing:true@/hop/1",
          "hop:0:navigate",
          "routing:true@/hop/0",
          "routing:false",
          "scrollTo:0",
          "| navigate /hop/3: settled routing=false at=/hop/0",
          "| hops done routing=false at=/hop/0",
          "| hops done 2 routing=false at=/hop/0",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("a redirect loop past MAX_REDIRECTS throws on the hop that exceeds it", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.navigate("/slow/held");
      flush();
      const hops = () => {
        for (let i = 1; i <= 100; i++) {
          h.navigate(`/slow/held-${i}`);
          flush();
        }
      };
      expect(hops).toThrow("Too many redirects");
    } finally {
      h.cleanup();
    }
  });

  test("a same-tick burst is separate navigations, not redirect hops", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      const length = window.history.length;
      h.reset();
      await h.step("burst", () => {
        h.navigate("/a");
        h.navigate("/b", { replace: true });
      });
      expect(window.location.pathname).toBe("/b");
      // `replace` is the second call's own, not inherited from the first
      expect(window.history.length).toBe(length);
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| burst: call routing=false at=/",
          "routing:true@/b",
          "routing:false",
          "scrollTo:0",
          "| burst: flush routing=false at=/b",
          "| burst: settled routing=false at=/b",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("a navigation issued while another is held is a hop of it", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      const length = window.history.length;
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      await h.step("navigate /b replace", () => h.navigate("/b", { replace: true }));
      expect(window.location.pathname).toBe("/b");
      // the hop inherits the held write's push
      expect(window.history.length).toBe(length + 1);
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /b replace: call routing=true target=/slow/1 intent=navigate at=/",
          "routing:true@/b",
          "link:/slow/1:false",
          "attr:/slow/1:-",
          "routing:false",
          "scrollTo:0",
          "| navigate /b replace: flush routing=false at=/b",
          "| navigate /b replace: settled routing=false at=/b",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("back/forward (native pops), sync and async", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      await h.step("navigate /a", () => h.navigate("/a"));
      h.reset();
      await h.traverse("back to /", () => window.history.back());
      window.history.pushState(null, "", "/slow/pop");
      await h.traverse("back", () => window.history.back());
      await h.traverse("forward to /slow/pop", () => window.history.forward());
      h.gate("pop").resolve("popped");
      await h.wait("resolved");
      expect(h.route()).toBe("slow");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "routing:true",
          "routing:false",
          "| back to / routing=false at=/",
          "| back routing=false at=/",
          "preload:pop:native",
          "fetch:pop:native",
          "routing:true",
          "| forward to /slow/pop routing=true intent=native at=/",
          "routing:false",
          "| resolved routing=false at=/slow/pop",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("scroll restoration waits for an async pop to land", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      await h.step("navigate /fresh/s", () => h.navigate("/fresh/s"));
      h.gate("s#1").resolve("s");
      await h.wait("landed /fresh/s");
      window.scrollTo(0, 700);
      await h.step("navigate /a", () => h.navigate("/a"));
      h.reset();
      await h.traverse("back to /fresh/s", () => window.history.back());
      h.gate("s#2").resolve("s");
      await h.wait("resolved");
      expect(h.route()).toBe("fresh");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "fresh:s#2",
          "routing:true",
          "| back to /fresh/s routing=true intent=native at=/a",
          "routing:false",
          "scrollTo:700",
          "| resolved routing=false at=/fresh/s",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("a back navigation's restore joins the traversal's transition and waits for its data", async () => {
    const h = harness("/", { scrollProbe: true });
    try {
      await h.wait("mounted");
      await h.step("navigate /fresh/p", () => h.navigate("/fresh/p"));
      h.gate("p#1").resolve("p");
      await h.wait("landed /fresh/p");
      window.scrollTo(0, 900);
      await h.step("navigate /a", () => h.navigate("/a"));
      h.reset();
      await h.traverse("back to /fresh/p", () => window.history.back());
      await h.wait("still pending");
      h.gate("p#2").resolve("p");
      await h.wait("resolved");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "fresh:p#2",
          "routing:true",
          "| back to /fresh/p routing=true intent=native at=/a",
          "| still pending routing=true intent=native at=/a",
          "routing:false",
          "scrollTo:900 shows=fresh",
          "| resolved routing=false at=/fresh/p",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("beforeLeave blocking a programmatic navigation and a native pop", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      await h.step("navigate /guarded", () => h.navigate("/guarded"));
      h.block(true);
      h.reset();
      await h.step("navigate /slow/1 (blocked)", () => h.navigate("/slow/1"));
      await h.traverse("back (blocked)", () => window.history.back(), 2);
      await h.wait("back (blocked) 2");
      expect(window.location.pathname).toBe("/guarded");
      expect(h.route()).toBe("guarded");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "blocked:/slow/1",
          "| navigate /slow/1 (blocked): call routing=false at=/guarded",
          "| navigate /slow/1 (blocked): flush routing=false at=/guarded",
          "| navigate /slow/1 (blocked): settled routing=false at=/guarded",
          "blocked:-1",
          "| back (blocked) routing=false at=/guarded",
          "| back (blocked) 2 routing=false at=/guarded",
        ]
      `);
    } finally {
      h.block(false);
      h.cleanup();
    }
  });

  test("a route whose data never resolves stays pending", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/never", () => h.navigate("/slow/never"));
      await h.wait("later");
      await h.wait("much later");
      expect(window.location.pathname).toBe("/");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/never: call routing=false at=/",
          "preload:never:navigate",
          "fetch:never:navigate",
          "routing:true@/slow/never",
          "| navigate /slow/never: flush routing=true target=/slow/never intent=navigate at=/",
          "| navigate /slow/never: settled routing=true target=/slow/never intent=navigate at=/",
          "| later routing=true target=/slow/never intent=navigate at=/",
          "| much later routing=true target=/slow/never intent=navigate at=/",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("initial load of an async route", async () => {
    const h = harness("/slow/init");
    try {
      h.mark("rendered");
      flush();
      h.mark("flushed");
      h.gate("init").resolve("init");
      await h.wait("resolved");
      expect(h.route()).toBe("slow");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "routing:false",
          "preload:init:initial",
          "fetch:init:-",
          "| rendered routing=false at=/slow/init",
          "| flushed routing=false at=/slow/init",
          "| resolved routing=false at=/slow/init",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });
  test("scroll restoration on a reload into an async route", async () => {
    const positions: Record<number, number> = {};
    for (let d = 0; d < 100; d++) positions[d] = 400;
    sessionStorage.setItem("solid-router:scroll", JSON.stringify(positions));
    const entries = performance.getEntriesByType;
    performance.getEntriesByType = ((type: string) =>
      type === "navigation" ? [{ type: "reload" }] : []) as any;
    let h!: ReturnType<typeof harness>;
    try {
      h = harness("/slow/reload");
      h.mark("rendered");
      flush();
      h.mark("flushed");
      await h.wait("settled");
      h.gate("reload").resolve("reload");
      await h.wait("resolved");
      expect(h.route()).toBe("slow");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "routing:false",
          "preload:reload:initial",
          "fetch:reload:-",
          "scrollTo:400",
          "| rendered routing=false at=/slow/reload",
          "| flushed routing=false at=/slow/reload",
          "| settled routing=false at=/slow/reload",
          "| resolved routing=false at=/slow/reload",
        ]
      `);
    } finally {
      performance.getEntriesByType = entries;
      h?.cleanup();
    }
  });

  // A reload lands on an existing entry: the restore targets a page whose
  // initial content is still arriving — route data, a lazy route component,
  // a lazy route subtree.
  async function reloadInto(initial: string, id: string) {
    const positions: Record<number, number> = {};
    for (let d = 0; d < 100; d++) positions[d] = 400;
    sessionStorage.setItem("solid-router:scroll", JSON.stringify(positions));
    const entries = performance.getEntriesByType;
    performance.getEntriesByType = ((type: string) =>
      type === "navigation" ? [{ type: "reload" }] : []) as any;
    let h!: ReturnType<typeof harness>;
    try {
      h = harness(initial, { scrollProbe: true, outerLoading: initial === "/tree" });
      h.mark("rendered");
      flush();
      h.mark("flushed");
      await h.wait("settled");
      h.gate(id).resolve(id);
      await h.wait("resolved");
      return h.log;
    } finally {
      performance.getEntriesByType = entries;
      h?.cleanup();
    }
  }

  test("scroll restoration on a reload while the route's data is pending", async () => {
    expect(await reloadInto("/slow/initial", "initial")).toMatchInlineSnapshot(`
      [
        "routing:false",
        "preload:initial:initial",
        "fetch:initial:-",
        "scrollTo:400 shows=loading",
        "| rendered routing=false at=/slow/initial",
        "| flushed routing=false at=/slow/initial",
        "| settled routing=false at=/slow/initial",
        "| resolved routing=false at=/slow/initial",
      ]
    `);
  });

  test("scroll restoration on a reload while a lazy route component loads", async () => {
    expect(await reloadInto("/lazy", "lazy")).toMatchInlineSnapshot(`
      [
        "routing:false",
        "scrollTo:400 shows=loading",
        "| rendered routing=false at=/lazy",
        "| flushed routing=false at=/lazy",
        "| settled routing=false at=/lazy",
        "| resolved routing=false at=/lazy",
      ]
    `);
  });

  test("scroll restoration on a reload into an unresolved lazy route subtree", async () => {
    expect(await reloadInto("/tree", "tree")).toMatchInlineSnapshot(`
      [
        "| rendered routing=<not ready> at=/tree",
        "| flushed routing=<not ready> at=/tree",
        "| settled routing=<not ready> at=/tree",
        "routing:false",
        "scrollTo:400 shows=tree",
        "| resolved routing=false at=/tree",
      ]
    `);
  });

  test("a navigation whose data rejects lands on the error boundary", async () => {
    const h = harness("/", { errored: true });
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/bad", () => h.navigate("/slow/bad"));
      h.gate("bad").reject(new Error("boom"));
      await h.wait("rejected");
      await h.step("navigate /a", () => h.navigate("/a"));
      expect(h.route()).toBe("a");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/bad: call routing=false at=/",
          "preload:bad:navigate",
          "fetch:bad:navigate",
          "routing:true@/slow/bad",
          "| navigate /slow/bad: flush routing=true target=/slow/bad intent=navigate at=/",
          "| navigate /slow/bad: settled routing=true target=/slow/bad intent=navigate at=/",
          "caught:boom",
          "routing:false",
          "scrollTo:0",
          "| rejected routing=false at=/slow/bad",
          "| navigate /a: call routing=false at=/slow/bad",
          "routing:true@/a",
          "routing:false",
          "scrollTo:0",
          "| navigate /a: flush routing=false at=/a",
          "| navigate /a: settled routing=false at=/a",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("intent seen by effects re-run in the landing flush, after commit and before settle", async () => {
    const h = harness("/", { landingProbe: true });
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/1", () => h.navigate("/slow/1"));
      h.gate("1").resolve("one");
      await h.wait("resolved");
      await h.step("navigate /a", () => h.navigate("/a"));
      expect(h.log).toMatchInlineSnapshot(`
        [
          "| navigate /slow/1: call routing=false at=/",
          "preload:1:navigate",
          "fetch:1:navigate",
          "attr:/slow/1:+",
          "routing:true@/slow/1",
          "link:/slow/1:true",
          "| navigate /slow/1: flush routing=true target=/slow/1 intent=navigate at=/",
          "| navigate /slow/1: settled routing=true target=/slow/1 intent=navigate at=/",
          "render-intent:/slow/1:navigate",
          "user-intent:/slow/1:navigate",
          "attr:/slow/1:-",
          "routing:false",
          "link:/slow/1:false",
          "scrollTo:0",
          "| resolved routing=false at=/slow/1",
          "| navigate /a: call routing=false at=/slow/1",
          "routing:true@/a",
          "render-intent:/a:navigate",
          "user-intent:/a:navigate",
          "routing:false",
          "scrollTo:0",
          "| navigate /a: flush routing=false at=/a",
          "| navigate /a: settled routing=false at=/a",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("scroll restoration on a pop between entries with an identical URL", async () => {
    const h = harness();
    try {
      await h.wait("mounted");
      await h.step("navigate /a #1", () => h.navigate("/a", { state: { n: 1 } }));
      window.scrollTo(0, 300);
      await h.step("navigate /a #2", () => h.navigate("/a", { state: { n: 2 } }));
      window.scrollTo(0, 50);
      h.reset();
      await h.traverse("back to /a #1", () => window.history.back());
      expect(window.history.state?.n).toBe(1);
      expect(h.log).toMatchInlineSnapshot(`
        [
          "routing:true",
          "routing:false",
          "scrollTo:300",
          "| back to /a #1 routing=false at=/a",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });

  test("the leave guard is asked about a composed destination against the held navigation", async () => {
    const h = harness("/watched");
    try {
      await h.wait("mounted");
      h.reset();
      await h.step("navigate /slow/w", () => h.navigate("/slow/w"));
      await h.step("setSearchParams", () => h.setSearch({ q: "1" }));
      h.gate("w").resolve("w");
      await h.wait("resolved");
      expect(window.location.pathname + window.location.search).toBe("/slow/w?q=1");
      expect(h.log).toMatchInlineSnapshot(`
        [
          "leave:/slow/w",
          "| navigate /slow/w: call routing=false at=/watched",
          "preload:w:navigate",
          "fetch:w:navigate",
          "routing:true@/slow/w",
          "| navigate /slow/w: flush routing=true target=/slow/w intent=navigate at=/watched",
          "| navigate /slow/w: settled routing=true target=/slow/w intent=navigate at=/watched",
          "leave:/slow/w?q=1",
          "| setSearchParams: call routing=true target=/slow/w intent=navigate at=/watched",
          "routing:true@/slow/w?q=1",
          "| setSearchParams: flush routing=true target=/slow/w?q=1 intent=navigate at=/watched",
          "| setSearchParams: settled routing=true target=/slow/w?q=1 intent=navigate at=/watched",
          "routing:false",
          "scrollTo:0",
          "| resolved routing=false at=/slow/w",
        ]
      `);
    } finally {
      h.cleanup();
    }
  });
});
