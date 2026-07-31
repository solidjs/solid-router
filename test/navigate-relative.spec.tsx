// @vitest-environment jsdom
import { render } from "@solidjs/web";
import { createRouter, memoryHistory, useLocation, useNavigate } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// navigate(string) resolves like an href (#502): URL semantics for relative
// strings, base-prefixing for absolute ones.
describe("relative navigation", () => {
  async function setup(initial: string) {
    let nav!: ReturnType<typeof useNavigate>;
    let loc!: ReturnType<typeof useLocation>;
    const Page = () => {
      nav = useNavigate();
      loc = useLocation();
      return <span>page</span>;
    };
    const Router = createRouter({
      routes: [{ path: "*all", component: Page }] as const,
      history: memoryHistory(initial)
    });
    const root = document.createElement("div");
    const dispose = render(() => <Router>{(p: any) => <div>{p.children}</div>}</Router>, root);
    await wait(30);
    const go = async (to: string, options?: any) => {
      nav(to, { scroll: false, ...options });
      await wait(30);
      return loc.pathname + loc.search + loc.hash;
    };
    return { go, dispose };
  }

  test("`..` resolves to the parent segment (#502)", async () => {
    const { go, dispose } = await setup("/show/home/fiction/333");
    expect(await go("../similar/333")).toBe("/show/home/similar/333");
    dispose();
  });

  test("a bare relative string resolves as a sibling, like an href", async () => {
    const { go, dispose } = await setup("/a/b");
    expect(await go("c")).toBe("/a/c");
    dispose();
  });

  test("`./` resolves against the parent directory", async () => {
    const { go, dispose } = await setup("/a/b");
    expect(await go("./c")).toBe("/a/c");
    dispose();
  });

  test("query-only strings keep the path and replace the search", async () => {
    const { go, dispose } = await setup("/a/b?x=1");
    expect(await go("?y=2")).toBe("/a/b?y=2");
    dispose();
  });

  test("hash-only strings keep the path and search", async () => {
    const { go, dispose } = await setup("/a/b?x=1");
    expect(await go("#section")).toBe("/a/b?x=1#section");
    dispose();
  });

  test("relative strings compose search and hash", async () => {
    const { go, dispose } = await setup("/show/home/fiction/333");
    expect(await go("../list?sort=asc#top")).toBe("/show/home/list?sort=asc#top");
    dispose();
  });

  test("absolute strings are untouched by URL resolution", async () => {
    const { go, dispose } = await setup("/a/b/c");
    expect(await go("/x/y")).toBe("/x/y");
    dispose();
  });

  test("external urls are not routable", async () => {
    const { go, dispose } = await setup("/a/b");
    await expect(go("https://example.com/evil")).rejects.toThrow(/not a routable path/);
    await expect(go("//example.com/evil")).rejects.toThrow(/not a routable path/);
    dispose();
  });

  test("resolve: false takes the string as the final path", async () => {
    const { go, dispose } = await setup("/a/b");
    expect(await go("/raw/path?q=1", { resolve: false })).toBe("/raw/path?q=1");
    dispose();
  });
});
