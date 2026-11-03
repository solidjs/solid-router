import { Errored, createMemo, Loading, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, query, useNavigate, usePreloadRoute } from "../src/index.js";
import { getInPreloadFn, setInPreloadFn } from "../src/routing.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("a route preload that throws", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn() as any;
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("in usePreloadRoute does not leave later query reads in preload mode", async () => {
    const getFiles = query(async () => {
      throw new Response(null, { status: 302, headers: { Location: "/login" } });
    }, "preload-throw-files");

    let preload!: ReturnType<typeof usePreloadRoute>;
    let navigate!: ReturnType<typeof useNavigate>;
    const Home = () => {
      preload = usePreloadRoute();
      navigate = useNavigate();
      return <span>home</span>;
    };
    const FilePage = () => {
      const files = createMemo(() => getFiles());
      return (
        <Loading fallback={<span>files-pending</span>}>
          <span>files:{String(files())}</span>
        </Loading>
      );
    };

    const caught: unknown[] = [];
    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        {
          path: "/broken",
          preload: () => {
            throw new Error("preload bug");
          },
          component: () => <span>broken</span>
        },
        { path: "/files", component: FilePage },
        { path: "/login", component: () => <span>login-page</span> }
      ] as const,
      history: memoryHistory("/")
    });

    const root = document.createElement("div");
    const dispose = render(
      () => (
        <Router>
          {(props: ParentProps) => (
            <Errored
              fallback={e => {
                caught.push(e());
                return <p>caught</p>;
              }}
            >
              {props.children}
            </Errored>
          )}
        </Router>
      ),
      root
    );
    try {
      await wait(30);
      expect(root.textContent).toBe("home");

      expect(() => preload("/broken", { preloadData: true })).toThrow("preload bug");
      expect(getInPreloadFn()).toBe(false);

      // a preload started from inside another preload hands the flag back
      setInPreloadFn(true);
      try {
        expect(() => preload("/broken", { preloadData: true })).toThrow("preload bug");
        expect(getInPreloadFn()).toBe(true);
      } finally {
        setInPreloadFn(false);
      }

      navigate("/files");
      await wait(150);
      expect(caught).toEqual([]);
      expect(root.textContent).toContain("login-page");
    } finally {
      dispose();
    }
  });

  test("during navigation resets the in-preload flag", async () => {
    let navigate!: ReturnType<typeof useNavigate>;
    const Router = createRouter({
      routes: [
        {
          path: "/",
          component: () => ((navigate = useNavigate()), (<span>home</span>))
        },
        {
          path: "/broken",
          preload: () => {
            throw new Error("preload bug");
          },
          component: () => <span>broken</span>
        }
      ] as const,
      history: memoryHistory("/")
    });

    const root = document.createElement("div");
    const dispose = render(
      () => (
        <Router>
          {(props: ParentProps) => <Errored fallback={<p>caught</p>}>{props.children}</Errored>}
        </Router>
      ),
      root
    );
    try {
      await wait(30);
      navigate("/broken");
      await wait(50);
      expect(root.textContent).toBe("caught");
      expect(getInPreloadFn()).toBe(false);
    } finally {
      dispose();
    }
  });
});
