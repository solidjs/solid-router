// @vitest-environment jsdom
// A redirect's revalidation sweep only refires queries under retained route
// sections. Leaving sections keep their invalidated entry — their render is
// disposed at commit and never paints, so eagerly refetching for them puts a
// visible second request on a single-flight mutation. The invalidation
// itself is universal: any later real use (a new navigation's preload or
// read, forward or back) sees the miss and fetches fresh. A plain
// revalidation with no navigation still sweeps everything.
import { createMemo, getOwner, runWithOwner, Loading, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import {
  createRouter,
  memoryHistory,
  query,
  revalidate,
  useNavigate,
  usePreloadRoute
} from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function setup(prefix: string) {
  const counts = { editor: 0, session: 0 };

  // editor-page-only query: matches the revalidate keys, never seeded
  const getEditor = query(async () => {
    counts.editor++;
    return { draft: "d" + counts.editor };
  }, `${prefix}-editor`);

  // layout query: survives the navigation
  const getSession = query(async () => {
    counts.session++;
    return { user: "u" + counts.session };
  }, `${prefix}-session`);

  const doSave = query(async () => {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/done", "X-Revalidate": `${prefix}-editor,${prefix}-session` }
    });
  }, `${prefix}-save`);

  const Layout = (props: ParentProps) => {
    const session = createMemo(() => getSession());
    return (
      <section>
        <Loading fallback={<span>s-pending</span>}>
          <header>user:{(session() as any)?.user}</header>
        </Loading>
        {props.children}
      </section>
    );
  };

  let triggerSave!: () => void;
  const EditorPage = () => {
    const editor = createMemo(() => getEditor());
    const owner = getOwner();
    triggerSave = () => runWithOwner(owner, () => (doSave() as any).catch(() => {}));
    return (
      <Loading fallback={<span>e-pending</span>}>
        <span>draft:{(editor() as any)?.draft}</span>
      </Loading>
    );
  };

  let goEdit!: () => void;
  let hoverEdit!: () => void;
  let saveAgain!: () => void;
  const DonePage = () => {
    const navigate = useNavigate();
    const preloadRoute = usePreloadRoute();
    const owner = getOwner();
    goEdit = () => navigate("/edit", { scroll: false });
    hoverEdit = () => preloadRoute("/edit", { preloadData: true });
    saveAgain = () => runWithOwner(owner, () => (doSave() as any).catch(() => {}));
    return <span>done-page</span>;
  };

  const Router = createRouter({
    routes: [
      { path: "/edit", component: EditorPage, preload: () => getEditor() },
      { path: "/done", component: DonePage }
    ] as const,
    history: memoryHistory("/edit")
  });

  const root = document.createElement("div");
  const dispose = render(
    () => <Router>{(props: ParentProps) => <Layout>{props.children}</Layout>}</Router>,
    root
  );

  return {
    root,
    dispose,
    counts,
    save: () => triggerSave(),
    goEdit: () => goEdit(),
    hoverEdit: () => hoverEdit(),
    saveAgain: () => saveAgain()
  };
}

describe("redirect revalidation and leaving route sections", () => {
  test("leaving section skips the eager refetch; survivors sweep in-batch", async () => {
    const s = setup("rr1");
    await wait(80);
    expect(s.root.innerHTML).toContain("draft:d1");
    expect(s.root.innerHTML).toContain("user:u1");

    s.save();
    await wait(150);

    expect(s.root.innerHTML).toContain("done-page");
    // survivor swept inside the transition, fresh at commit
    expect(s.root.innerHTML).toContain("user:u2");
    expect(s.counts.session).toBe(2);
    // leaving section: no phantom request
    expect(s.counts.editor).toBe(1);
    s.dispose();
  });

  test("a later forward navigation sees the invalidated entry and fetches fresh", async () => {
    const s = setup("rr2");
    await wait(80);
    s.save();
    await wait(150);
    expect(s.root.innerHTML).toContain("done-page");
    expect(s.counts.editor).toBe(1);

    s.goEdit();
    await wait(150);

    expect(s.root.innerHTML).toContain("draft:d2");
    expect(s.counts.editor).toBe(2);
    s.dispose();
  });

  test("a preload after the mutation warms the invalidated entry; the click serves it", async () => {
    const s = setup("rr4");
    await wait(80);
    s.save();
    await wait(150);
    expect(s.counts.editor).toBe(1); // invalidated, not eagerly refetched

    // hover: the preload sees the miss and fetches post-mutation data
    s.hoverEdit();
    await wait(80);
    expect(s.counts.editor).toBe(2);

    // click within the preload window: serves the warmed entry, no refetch
    s.goEdit();
    await wait(150);
    expect(s.root.innerHTML).toContain("draft:d2");
    expect(s.counts.editor).toBe(2);
    s.dispose();
  });

  test("a mutation busts a hover-preloaded entry; the click fetches fresh", async () => {
    const s = setup("rr5");
    await wait(80);
    s.save();
    await wait(150);

    // hover warms the entry (fetch 2), then a second mutation busts it
    s.hoverEdit();
    await wait(80);
    expect(s.counts.editor).toBe(2);
    s.saveAgain();
    await wait(150);
    expect(s.counts.editor).toBe(2); // busted, not refetched (no consumer)

    // the click must not serve the pre-mutation preload
    s.goEdit();
    await wait(150);
    expect(s.root.innerHTML).toContain("draft:d3");
    expect(s.counts.editor).toBe(3);
    s.dispose();
  });

  test("a seeded entry may be an unresolved promise: fresh, served, not refetched", async () => {
    let fetches = 0;
    const getThing = query(async () => {
      fetches++;
      return "fetched" + fetches;
    }, "rr6-thing");

    const Page = () => {
      const thing = createMemo(() => getThing());
      return (
        <Loading fallback={<span>pending</span>}>
          <span>thing:{thing() as any}</span>
        </Loading>
      );
    };
    const Router = createRouter({
      routes: [{ path: "/", component: Page }] as const,
      history: memoryHistory("/")
    });
    const root = document.createElement("div");
    const dispose = render(() => <Router>{(p: ParentProps) => <>{p.children}</>}</Router>, root);
    await wait(80);
    expect(root.innerHTML).toContain("thing:fetched1");

    // seed with a still-streaming value, as the flight consumer does, then sweep
    let land!: (v: string) => void;
    query.set(getThing.keyFor(), new Promise<string>(r => (land = r)) as any);
    revalidate(getThing.key, false);
    await wait(30);
    expect(fetches).toBe(1); // fresh stamp: the sweep serves the promise, no refetch

    land("streamed");
    await wait(30);
    expect(root.innerHTML).toContain("thing:streamed");
    dispose();
  });

  test("a plain revalidation with no navigation sweeps everything", async () => {
    const s = setup("rr3");
    await wait(80);
    expect(s.counts.editor).toBe(1);

    revalidate(["rr3-editor", "rr3-session"]);
    await wait(80);

    expect(s.counts.editor).toBe(2);
    expect(s.counts.session).toBe(2);
    expect(s.root.innerHTML).toContain("draft:d2");
    expect(s.root.innerHTML).toContain("user:u2");
    s.dispose();
  });
});
