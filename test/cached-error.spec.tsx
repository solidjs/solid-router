// @vitest-environment jsdom
import { Errored, Loading, createMemo, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, query, useNavigate } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("#385 error from cached preload stays an error", () => {
  test("cache-hit calls reject with the original error", async () => {
    // no owner on purpose: query skips the navigator and runs standalone
    const error = new Error("boom-385");
    const fetch = vi.fn(async () => {
      throw error;
    });
    const failing = query(fetch, "failing-direct");
    const first = failing();
    const cached = failing();

    await Promise.all([expect(first).rejects.toBe(error), expect(cached).rejects.toBe(error)]);
    expect(fetch).toHaveBeenCalledTimes(1);
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

    // Navigate away and back within the cache window.
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

test("resetting an error boundary retries a rejected query immediately", async () => {
  const fetchProduct = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("transient failure"))
    .mockResolvedValue("Product loaded");
  const getProduct = query(fetchProduct, "retry-product");
  const Product = () => {
    const product = createMemo(() => getProduct());
    return <p>{product()}</p>;
  };
  const Router = createRouter({
    routes: [{ path: "/", component: Product }],
    history: memoryHistory("/")
  });
  const root = document.createElement("div");
  vi.useFakeTimers({ toFake: ["Date"] });
  const dispose = render(
    () => (
      <Router>
        {props => (
          <Errored fallback={(_error, reset) => <button onClick={reset}>Retry</button>}>
            <Loading fallback={<p>Loading</p>}>{props.children}</Loading>
          </Errored>
        )}
      </Router>
    ),
    root
  );

  try {
    await vi.waitFor(() => expect(root.textContent).toBe("Retry"));
    expect(fetchProduct).toHaveBeenCalledTimes(1);

    root.querySelector("button")!.click();
    await vi.waitFor(() => expect(root.textContent).toBe("Product loaded"), { timeout: 300 });
    expect(fetchProduct).toHaveBeenCalledTimes(2);
  } finally {
    dispose();
    vi.useRealTimers();
  }
});
