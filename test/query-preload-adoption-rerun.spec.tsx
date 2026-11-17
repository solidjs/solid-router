// @vitest-environment jsdom
// #739: navigating into a preloaded route re-runs the destination's async
// computations.
//
// A hover preload reads the route's `query()` with intent "preload", so the cache
// entry is stamped `cached[3] = "preload"`. The navigation that follows reads the
// same entry with intent "navigate" and takes the reuse branch in
// `src/data/query.ts`: `cached[0] = now` runs on every read, and that stamp is
// published into the entry's version signal. The subscribed async memo re-runs,
// reads again (new `now`), and re-runs again.
//
// The loop ends when two reads land in the same millisecond, so the clock is
// pinned here: +1ms per `Date.now()` call, frozen after 10 calls.
import { createMemo, Loading } from "solid-js";
import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, memoryHistory, query, useNavigate, usePreloadRoute } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("query() preload entry adoption (#739)", () => {
  const originalScrollTo = window.scrollTo;
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });
  afterAll(() => {
    window.scrollTo = originalScrollTo;
  });

  test("navigation into a preloaded route runs the async memo once", async () => {
    const realNow = Date.now;
    let tick = 1_000_000;
    const clock = vi
      .spyOn(Date, "now")
      .mockImplementation(() => (tick = Math.min(tick + 1, 1_000_010)));

    let runs = 0;
    const getValue = query(async () => {
      await wait(50);
      return 42;
    }, "preload-adoption-value");

    function Page() {
      const value = createMemo(async () => {
        runs++;
        return await getValue();
      });
      return (
        <Loading fallback={<p>loading</p>}>
          <p>value: {value()}</p>
        </Loading>
      );
    }

    let open!: () => void;
    function Home() {
      const preloadRoute = usePreloadRoute();
      const navigate = useNavigate();
      open = () => {
        // What `preloadLinks: intentPreload()` does on pointer dwell.
        preloadRoute("/page/", { preloadData: true });
        navigate("/page/");
      };
      return <h1>Home</h1>;
    }

    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        { path: "/page/", component: Page, preload: () => void getValue() }
      ],
      history: memoryHistory("/")
    });

    const div = document.createElement("div");
    document.body.appendChild(div);
    const dispose = render(() => <Router />, div);
    try {
      for (let i = 0; i < 20 && !div.textContent?.includes("Home"); i++) await wait(10);
      expect(div.textContent).toContain("Home");

      open();

      for (let i = 0; i < 100; i++) {
        await wait(20);
        if (div.textContent?.includes("value: 42")) break;
      }
      expect(div.textContent).toContain("value: 42");

      // Let queued re-runs start.
      await wait(300);
      expect(runs).toBe(1);
    } finally {
      dispose();
      div.remove();
      clock.mockRestore();
    }
  }, 20000);
});
