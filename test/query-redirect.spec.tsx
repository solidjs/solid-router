// @vitest-environment jsdom
import { Errored, createMemo, Loading, type ParentProps } from "solid-js";
import { render, respond } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, hashHistory, memoryHistory, query, useSearchParams } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const redirectResponse = (to: string, revalidate?: string) =>
  new Response(null, {
    status: 302,
    headers: revalidate ? { Location: to, "X-Revalidate": revalidate } : { Location: to }
  });

function mount(Router: any, caught: any[]) {
  const Root = (props: ParentProps) => {
    return (
      <div>
        <Errored
          fallback={error => {
            caught.push(error());
            return <p>caught</p>;
          }}
        >
          {props.children}
        </Errored>
      </div>
    );
  };
  const root = document.createElement("div");
  const dispose = render(
    () => <Router>{(props: ParentProps) => <Root {...props} />}</Router>,
    root
  );
  return { root, dispose };
}

describe("redirects thrown from queries", () => {
  test("X-Revalidate keys on a query redirect invalidate and revalidate (#580 thread)", async () => {
    let sessionFetches = 0;
    const getSession = query(async () => {
      sessionFetches++;
      return { user: sessionFetches === 1 ? "expired" : "anonymous" };
    }, "qr-session");
    const getFiles = query(async () => {
      throw redirectResponse("/login", getSession.key);
    }, "qr-files");

    // survives the navigation, so its session read must revalidate afterwards
    const Layout = (props: ParentProps) => {
      const session = createMemo(() => getSession());
      return (
        <section>
          <Loading fallback={<span>session-pending</span>}>
            <header>user:{(session() as any)?.user}</header>
          </Loading>
          {props.children}
        </section>
      );
    };

    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return (
        <Loading fallback={<span>files-pending</span>}>
          <span>files:{String(files())}</span>
        </Loading>
      );
    };

    const caught: any[] = [];
    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files")
    });

    const root = document.createElement("div");
    const dispose = render(
      () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
      root
    );

    await wait(150);
    expect(root.innerHTML).toContain("login-page");
    // initial fetch + post-redirect revalidation of the invalidated key
    expect(sessionFetches).toBe(2);
    expect(root.innerHTML).toContain("user:anonymous");
    expect(caught).toEqual([]);
    dispose();
  });

  test("the redirect sweep notifies a query fetched within the same millisecond", async () => {
    // The live version signal is the entry's fetch stamp; when the redirect
    // lands before the clock ticks past the mount, a stamp-valued write is a
    // no-op and the surviving layout keeps its stale value. Freeze the clock
    // so the same-ms case is the only case (it was a coin toss under load).
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      let sessionFetches = 0;
      const getSession = query(async () => {
        sessionFetches++;
        return { user: sessionFetches === 1 ? "expired" : "anonymous" };
      }, "qr-frozen-session");
      const getFiles = query(async () => {
        throw redirectResponse("/login", getSession.key);
      }, "qr-frozen-files");

      const Layout = (props: ParentProps) => {
        const session = createMemo(() => getSession());
        return (
          <section>
            <Loading fallback={<span>session-pending</span>}>
              <header>user:{(session() as any)?.user}</header>
            </Loading>
            {props.children}
          </section>
        );
      };
      const FilePage = () => {
        const files = createMemo(() => getFiles());
        return (
          <Loading fallback={<span>files-pending</span>}>
            <span>files:{String(files())}</span>
          </Loading>
        );
      };

      const Router = createRouter({
        routes: [
          { path: "/files", component: FilePage },
          { path: "/login", component: () => <span>login-page</span> }
        ] as const,
        history: memoryHistory("/files")
      });
      const root = document.createElement("div");
      const dispose = render(
        () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
        root
      );

      await wait(150);
      expect(root.innerHTML).toContain("login-page");
      expect(sessionFetches).toBe(2);
      expect(root.innerHTML).toContain("user:anonymous");
      dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  test("X-Revalidate: * on a query redirect revalidates every surviving query", async () => {
    // A read that redirects declares nothing by default; `revalidate: "*"`
    // is the author saying everything went stale — no key named, the
    // surviving layout's session read revalidates all the same.
    let sessionFetches = 0;
    const getSession = query(async () => {
      sessionFetches++;
      return { user: sessionFetches === 1 ? "expired" : "anonymous" };
    }, "qr-all-session");
    const getFiles = query(async () => {
      throw redirectResponse("/login", "*");
    }, "qr-all-files");

    const Layout = (props: ParentProps) => {
      const session = createMemo(() => getSession());
      return (
        <section>
          <Loading fallback={<span>session-pending</span>}>
            <header>user:{(session() as any)?.user}</header>
          </Loading>
          {props.children}
        </section>
      );
    };
    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return (
        <Loading fallback={<span>files-pending</span>}>
          <span>files:{String(files())}</span>
        </Loading>
      );
    };

    const caught: any[] = [];
    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files")
    });
    const root = document.createElement("div");
    const dispose = render(
      () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
      root
    );

    await wait(150);
    expect(root.innerHTML).toContain("login-page");
    expect(sessionFetches).toBe(2);
    expect(root.innerHTML).toContain("user:anonymous");
    expect(caught).toEqual([]);
    dispose();
  });

  test("consumers never observe a value from a redirecting query", async () => {
    const observed: any[] = [];
    const caught: any[] = [];

    const getFiles = query(async (_s: string) => {
      throw redirectResponse("/login");
    }, "qr-consume-files");
    const getCategories = query(async () => {
      throw redirectResponse("/login");
    }, "qr-consume-categories");

    const ShowCategories = (props: { value: any }) => {
      const options = createMemo(() => {
        observed.push(props.value);
        return props.value.map((x: any) => x.id);
      });
      return <span>cats:{String(options())}</span>;
    };
    const FileGrid = (props: { value: any }) => {
      const rows = createMemo(() => {
        observed.push(props.value);
        return props.value.map((x: any) => x.id);
      });
      return <span>files:{String(rows())}</span>;
    };

    const FilePage = () => {
      const files = createMemo(() => getFiles("?a=1"));
      const categories = createMemo(() => getCategories());
      return (
        <main>
          <Loading fallback={<span>l1</span>}>
            <ShowCategories value={categories()} />
          </Loading>
          <Loading fallback={<span>l2</span>}>
            <FileGrid value={files()} />
          </Loading>
        </main>
      );
    };

    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files")
    });

    const { root, dispose } = mount(Router, caught);
    await wait(150);

    expect(root.innerHTML).toContain("login-page");
    // the redirecting queries must never hand a value (undefined included) to render
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
    dispose();
  });

  test("a refetch that redirects after setSearchParams navigates without exposing stale state", async () => {
    const caught: any[] = [];
    const observed: any[] = [];
    let setParams!: ReturnType<typeof useSearchParams>[1];

    const getFiles = query(async (page: string) => {
      if (page === "1") return [{ id: "f1" }];
      throw redirectResponse("/login");
    }, "qr-search-files");

    const FileGrid = (props: { value: any }) => {
      const rows = createMemo(() => {
        observed.push(props.value);
        return props.value.map((x: any) => x.id).join(",");
      });
      return <span>files:{rows()}</span>;
    };

    const FilePage = () => {
      const [params, set] = useSearchParams();
      setParams = set;
      const files = createMemo(() => getFiles(String(params.page ?? "1")));
      return (
        <main>
          <Loading fallback={<span>l</span>}>
            <FileGrid value={files()} />
          </Loading>
        </main>
      );
    };

    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files?page=1")
    });

    const { root, dispose } = mount(Router, caught);
    await wait(150);
    expect(root.innerHTML).toContain("files:f1");

    setParams({ page: "2" }, { scroll: false });
    await wait(200);

    expect(root.innerHTML).toContain("login-page");
    expect(observed).toEqual([[{ id: "f1" }]]);
    expect(caught).toEqual([]);
    dispose();
  });
});

describe.each(["returned", "thrown"])("%s query response metadata", mode => {
  let initial: string;
  let originalLocation: Location;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    query.clear();
    initial = "/docs/chapter?filter=active";
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: new URL(initial, originalLocation.href).href },
      configurable: true
    });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    query.clear();
    Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
  });

  async function setup(response: Response | ReturnType<typeof respond>, base?: string) {
    const observed: unknown[] = [];
    const caught: unknown[] = [];
    const read = query(async () => {
      if (mode === "thrown") throw response;
      return response;
    }, "qr-response-metadata");
    const history = memoryHistory(initial);
    const Page = () => {
      read().then(
        value => observed.push(value),
        error => caught.push(error)
      );
      return <span>page</span>;
    };
    const Router = createRouter({
      routes: [
        { path: "*all", component: Page },
        { path: "/sign-in", component: () => <span>sign-in-page</span> }
      ] as const,
      history,
      base
    });
    const mounted = mount(Router, caught);
    dispose = mounted.dispose;
    await wait(50);
    return { root: mounted.root, history, observed, caught };
  }

  test.each([
    ["/next?q=1#part", "/next?q=1#part"],
    ["../next?q=1#part", "/next?q=1#part"],
    ["?saved=1", "/docs/chapter?saved=1"],
    ["#part", "/docs/chapter?filter=active#part"],
    [new URL("/next?q=1#part", window.location.href).href, "/next?q=1#part"],
    [`//${window.location.host}/next?q=1#part`, "/next?q=1#part"]
  ])("navigates within the router for %s", async (target, expected) => {
    const href = window.location.href;
    const { history, observed, caught } = await setup(redirectResponse(target));

    expect(history.get()).toBe(expected);
    expect(window.location.href).toBe(href);
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
    history.back();
    expect(history.get()).toBe(expected);
  });

  test.each([
    ["/next?q=1#part", "/app/next?q=1#part"],
    ["../next?q=1#part", "/app/next?q=1#part"],
    ["?saved=1", "/app/docs/chapter?saved=1"],
    ["#part", "/app/docs/chapter?filter=active#part"],
    [new URL("/app/next?q=1#part", window.location.href).href, "/app/next?q=1#part"],
    [new URL("/app?q=1#part", window.location.href).href, "/app?q=1#part"],
    [new URL("/APP/next?q=1#part", window.location.href).href, "/APP/next?q=1#part"],
    [`//${window.location.host}/app/next?q=1#part`, "/app/next?q=1#part"]
  ])("keeps the router base for %s", async (target, expected) => {
    initial = "/app/docs/chapter?filter=active";
    window.location.href = new URL(initial, originalLocation.href).href;
    const href = window.location.href;
    const { history, observed, caught } = await setup(redirectResponse(target), "/app");
    expect(history.get()).toBe(expected);
    expect(window.location.href).toBe(href);
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
    history.back();
    expect(history.get()).toBe(expected);
  });

  test("keeps a carried redirect relative to the router base", async () => {
    initial = "/app/docs/chapter";
    window.location.href = new URL(initial, originalLocation.href).href;
    const href = window.location.href;
    const { root, history, observed, caught } = await setup(
      carriedRedirect("/sign-in?q=1#part"),
      "/app"
    );
    expect(history.get()).toBe("/app/sign-in?q=1#part");
    expect(root.textContent).toBe("sign-in-page");
    expect(window.location.href).toBe(href);
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
    history.back();
    expect(history.get()).toBe("/app/sign-in?q=1#part");
  });

  test.each([
    new URL("/other?q=1#part", window.location.href).href,
    "../../other?q=1#part",
    new URL("/apple/next", window.location.href).href,
    `//${window.location.host}/other`
  ])("navigates the document for a local URL outside the router base: %s", async target => {
    initial = "/app/docs/chapter";
    window.location.href = new URL(initial, originalLocation.href).href;
    const href = window.location.href;
    const expected = new URL(target, href).href;
    const { root, history, observed, caught } = await setup(redirectResponse(target), "/app");
    expect(new URL(window.location.href, href).href).toBe(expected);
    expect(history.get()).toBe(initial);
    expect(root.textContent).toBe("page");
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
  });

  test.each([301, 303, 307, 308])("follows a local %i redirect", async status => {
    const { history, observed, caught } = await setup(
      new Response(null, { status, headers: { Location: "/next" } })
    );
    expect(history.get()).toBe("/next");
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
  });

  test.each(["https://elsewhere.example/next?q=1#part", "//elsewhere.example/next?q=1#part"])(
    "navigates the document for %s",
    async target => {
      const expected = new URL(target, window.location.href).href;
      const { history, observed, caught } = await setup(redirectResponse(target));
      expect(window.location.href).toBe(expected);
      expect(history.get()).toBe(initial);
      expect(observed).toEqual([]);
      expect(caught).toEqual([]);
    }
  );

  test.each([200, 201, 304, 404])("keeps Location as data on status %i", async status => {
    const href = window.location.href;
    const response = new Response(null, { status, headers: { Location: "/created" } });
    const { history, observed, caught } = await setup(response);
    expect(history.get()).toBe(initial);
    expect(window.location.href).toBe(href);
    expect(observed).toEqual(mode === "returned" ? [response] : []);
    expect(caught).toEqual(mode === "thrown" ? [response] : []);
  });

  test("preserves a respond() value with status 201 and Location", async () => {
    const value = { id: "created" };
    const response = respond(value, { status: 201, headers: { Location: "/created" } });
    const { history, observed, caught } = await setup(response);
    expect(history.get()).toBe(initial);
    expect(observed).toEqual(mode === "returned" ? [value] : []);
    expect(caught).toEqual(mode === "thrown" ? [value] : []);
  });

  test("prefers the redirect carrier over a non-redirect Location", async () => {
    const response = carriedRedirect("/sign-in?q=1#part");
    response.headers.set("Location", "/created");
    const { history, observed, caught } = await setup(response);
    expect(history.get()).toBe("/sign-in?q=1#part");
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
  });
});

describe.each(["returned", "thrown"])("%s query redirects with hashHistory", mode => {
  let href: string;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    query.clear();
    href = window.location.href;
    window.history.replaceState(null, "", "/shell#/private");
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    query.clear();
    window.history.replaceState(null, "", href);
  });

  test.each([
    ["local", "#/login?q=1#part", ""],
    ["local", new URL("/shell#/login?q=1#part", window.location.href).href, ""],
    ["local", `//${window.location.host}/shell#/login?q=1#part`, ""],
    ["carried", "/login?q=1#part", ""],
    ["carried", "/login?q=1#part", "/app"]
  ])("renders a %s redirect to %s with base '%s'", async (kind, target, base) => {
    window.history.replaceState(null, "", `/shell#${base}/private`);
    const observed: unknown[] = [];
    const caught: unknown[] = [];
    const read = query(async () => {
      const response = kind === "carried" ? carriedRedirect(target) : redirectResponse(target);
      if (mode === "thrown") throw response;
      return response;
    }, "qr-hash-redirect");
    const Page = () => {
      read().then(
        value => observed.push(value),
        error => caught.push(error)
      );
      return <span>private-page</span>;
    };
    const Router = createRouter({
      history: hashHistory(),
      base,
      routes: [
        { path: "/private", component: Page },
        { path: "/login", component: () => <span>login-page</span> }
      ]
    });
    const mounted = mount(Router, caught);
    dispose = mounted.dispose;
    await wait(100);
    expect(mounted.root.textContent).toBe("login-page");
    expect(window.location.pathname).toBe("/shell");
    expect(window.location.hash).toBe(`#${base}/login?q=1#part`);
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
  });

  test.each([
    new URL("/other-shell#/login", window.location.href).href,
    new URL("/shell?new=1#/login", window.location.href).href,
    new URL("/shell", window.location.href).href
  ])("navigates the document when a URL cannot stay in hash history: %s", async target => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: originalLocation.href },
      configurable: true
    });
    try {
      const caught: unknown[] = [];
      const read = query(async () => {
        const response = redirectResponse(target);
        if (mode === "thrown") throw response;
        return response;
      }, "qr-hash-document");
      const Page = () => {
        read().catch(error => caught.push(error));
        return <span>private-page</span>;
      };
      const Router = createRouter({
        history: hashHistory(),
        routes: [{ path: "*all", component: Page }]
      });
      ({ dispose } = mount(Router, caught));
      await wait(50);
      expect(window.location.href).toBe(target);
      expect(originalLocation.hash).toBe("#/private");
      expect(caught).toEqual([]);
    } finally {
      dispose?.();
      dispose = undefined;
      Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
    }
  });
});

// The shape a `"use server"` redirect reaches a client-side query in: the
// server-function transport masks the 3xx to 200, drops `Location`, and carries
// "<status> <absolute-url>" in X-Server-Function-Redirect; the client transport
// then hands that Response over whole (solidjs/solid-router#603).
const carriedRedirect = (to: string, revalidate?: string) =>
  new Response(null, {
    status: 200,
    headers: {
      "X-Server-Function-Redirect": `302 ${new URL(to, window.location.href).href}`,
      ...(revalidate ? { "X-Revalidate": revalidate } : {})
    }
  });

describe("redirects carried by the server-function transport (#603)", () => {
  test("a masked redirect navigates and never reaches consumers", async () => {
    const observed: any[] = [];
    const caught: any[] = [];

    const requireUser = query(async () => carriedRedirect("/sign-in"), "qr-carrier-user");

    const Account = (props: { value: any }) => {
      const name = createMemo(() => {
        observed.push(props.value);
        return props.value.name;
      });
      return <span>account:{name()}</span>;
    };

    const AccountPage = () => {
      const user = createMemo(() => requireUser());
      return (
        <Loading fallback={<span>account-pending</span>}>
          <Account value={user()} />
        </Loading>
      );
    };

    const Router = createRouter({
      routes: [
        { path: "/account", component: AccountPage },
        { path: "/sign-in", component: () => <span>sign-in-page</span> }
      ] as const,
      history: memoryHistory("/account")
    });

    const { root, dispose } = mount(Router, caught);
    await wait(150);

    expect(root.innerHTML).toContain("sign-in-page");
    // the Response must not become the query's value
    expect(observed).toEqual([]);
    expect(caught).toEqual([]);
    dispose();
  });

  test("X-Revalidate keys on a masked redirect invalidate and revalidate", async () => {
    let sessionFetches = 0;
    const getSession = query(async () => {
      sessionFetches++;
      return { user: sessionFetches === 1 ? "expired" : "anonymous" };
    }, "qr-carrier-session");
    const getFiles = query(
      async () => carriedRedirect("/login", getSession.key),
      "qr-carrier-files"
    );

    const Layout = (props: ParentProps) => {
      const session = createMemo(() => getSession());
      return (
        <section>
          <Loading fallback={<span>session-pending</span>}>
            <header>user:{(session() as any)?.user}</header>
          </Loading>
          {props.children}
        </section>
      );
    };

    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return (
        <Loading fallback={<span>files-pending</span>}>
          <span>files:{String(files())}</span>
        </Loading>
      );
    };

    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files")
    });

    const root = document.createElement("div");
    const dispose = render(
      () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
      root
    );

    await wait(150);
    expect(root.innerHTML).toContain("login-page");
    expect(sessionFetches).toBe(2);
    expect(root.innerHTML).toContain("user:anonymous");
    dispose();
  });

  test("a masked redirect with X-Revalidate: * sweeps every surviving query", async () => {
    // Both protocols on one response: the carrier is decoded to the target
    // and `*` (no key named) still means everything went stale — the
    // surviving layout's session read revalidates inside the same navigation.
    let sessionFetches = 0;
    const getSession = query(async () => {
      sessionFetches++;
      return { user: sessionFetches === 1 ? "expired" : "anonymous" };
    }, "qr-carrier-all-session");
    const getFiles = query(async () => carriedRedirect("/login", "*"), "qr-carrier-all-files");

    const Layout = (props: ParentProps) => {
      const session = createMemo(() => getSession());
      return (
        <section>
          <Loading fallback={<span>session-pending</span>}>
            <header>user:{(session() as any)?.user}</header>
          </Loading>
          {props.children}
        </section>
      );
    };

    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return (
        <Loading fallback={<span>files-pending</span>}>
          <span>files:{String(files())}</span>
        </Loading>
      );
    };

    const Router = createRouter({
      routes: [
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/files")
    });

    const root = document.createElement("div");
    const dispose = render(
      () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
      root
    );

    await wait(150);
    expect(root.innerHTML).toContain("login-page");
    expect(sessionFetches).toBe(2);
    expect(root.innerHTML).toContain("user:anonymous");
    dispose();
  });
});
