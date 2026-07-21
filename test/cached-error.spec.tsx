// @vitest-environment jsdom
import { createErrorBoundary, createMemo, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory, query, useNavigate } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("#385 error from cached preload stays an error", () => {
  test("cache-hit calls reject with the original error", async () => {
    // no owner on purpose: query skips the navigator and runs standalone
    const failing = query(async () => {
      throw new Error("boom-385");
    }, "failing-direct");

    await expect(failing()).rejects.toThrow("boom-385");
    // second call within the freshness window is a cache hit on the rejected promise
    await expect(failing()).rejects.toThrow("boom-385");
  });

  test("error surfaces via the boundary on cache-hit renders, never as a value", async () => {
    const failing = query(async () => {
      throw new Error("boom-385-render");
    }, "failing385render");

    let nav!: ReturnType<typeof useNavigate>;
    const rendered: any[] = [];
    const caught: any[] = [];

    const Test = () => {
      const data = createMemo(() => failing());
      return (
        <span>
          {(() => {
            const v = data();
            rendered.push(v);
            return `value:${String(v)}`;
          })()}
        </span>
      );
    };
    const Root = (props: ParentProps) => {
      nav = useNavigate();
      // the fallback receives an error *accessor* in Solid 2, not the error itself
      const content = createErrorBoundary(
        () => props.children,
        (error): any => {
          caught.push(error());
          return <p>caught</p>;
        }
      );
      return <div>{content() as any}</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: () => <span>home</span> },
        { path: "/test", component: Test, preload: () => failing() }
      ] as const,
      history: memoryHistory("/test")
    });
    const root = document.createElement("div");
    const dispose = render(() => <Router>{props => <Root {...props} />}</Router>, root);

    await wait(50);
    expect(root.innerHTML).toContain("caught");
    expect(caught.length).toBeGreaterThan(0);
    expect((caught[0] as Error).message).toBe("boom-385-render");

    // navigate away and back within the cache window — the cached rejected
    // promise is served from cache on the return trip
    nav("/", { scroll: false });
    await wait(50);
    expect(root.innerHTML).toContain("home");

    nav("/test", { scroll: false });
    await wait(50);

    // the error must surface via the boundary, never as a resolved value
    expect(rendered.filter(v => v !== undefined)).toEqual([]);
    expect(root.innerHTML).toContain("caught");

    dispose();
  });
});
