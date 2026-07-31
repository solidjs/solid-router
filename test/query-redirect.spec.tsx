// @vitest-environment jsdom
import { createErrorBoundary, createMemo, Loading, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
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
      (error): any => {
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
