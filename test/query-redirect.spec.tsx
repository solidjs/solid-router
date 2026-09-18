// @vitest-environment jsdom
import { createErrorBoundary, createMemo, Loading, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, query, useSearchParams } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const redirectResponse = (to: string, revalidate?: string) =>
  new Response(null, {
    status: 302,
    headers: revalidate ? { Location: to, "X-Revalidate": revalidate } : { Location: to }
  });

function mount(Router: any, caught: any[]) {
  const Root = (props: ParentProps) => {
    const content = createErrorBoundary(
      () => props.children,
      (error: () => unknown): any => {
        caught.push(error());
        return <p>caught</p>;
      }
    );
    return <div>{content() as any}</div>;
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
