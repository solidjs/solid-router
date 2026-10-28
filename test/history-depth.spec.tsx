import { render } from "solid-js/web";
import { vi } from "vitest";
import { HashRouter, Router, Route, useNavigate } from "../src/index.js";
import type { Navigator } from "../src/index.js";
import { notifyIfNotBlocked } from "../src/lifecycle.js";

// #694: browsers cap session history (50 entries in Chromium and Firefox).
// Once full, a push drops the oldest entry and history.length stops growing,
// so depths taken from history.length repeat.
describe("history depth when history.length is capped (#694)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  const url = () => window.location.pathname + window.location.search + window.location.hash;

  async function pushThree(RouterComponent: typeof Router | typeof HashRouter, hash = false) {
    let navigate!: Navigator;
    const Page = () => {
      navigate = useNavigate();
      return null;
    };
    const dispose = render(
      () => (
        <RouterComponent>
          <Route path="/:n?" component={Page} />
        </RouterComponent>
      ),
      document.body
    );
    try {
      const depths: number[] = [];
      for (let i = 1; i <= 3; i++) {
        navigate(`/${i}`);
        await vi.waitFor(() => expect(url()).toBe(hash ? `/#/${i}` : `/${i}`));
        depths.push(window.history.state._depth);
      }
      navigate("/3?replaced", { replace: true });
      await vi.waitFor(() => expect(url()).toBe(hash ? "/#/3?replaced" : "/3?replaced"));
      depths.push(window.history.state._depth);
      return depths;
    } finally {
      dispose();
    }
  }

  test("Router stamps increasing depths on push", async () => {
    window.history.replaceState({ _depth: 48 }, "", "/");
    vi.spyOn(window.history, "length", "get").mockReturnValue(50);
    expect(await pushThree(Router)).toEqual([49, 50, 51, 51]);
  });

  test("HashRouter stamps increasing depths on push", async () => {
    window.history.replaceState({ _depth: 48 }, "", "/");
    vi.spyOn(window.history, "length", "get").mockReturnValue(50);
    expect(await pushThree(HashRouter, true)).toEqual([49, 50, 51, 51]);
  });

  test("Router keeps user state when stamping the depth on push", async () => {
    window.history.replaceState({ _depth: 3 }, "", "/");
    let navigate!: Navigator;
    const dispose = render(
      () => (
        <Router>
          <Route
            path="/*"
            component={() => {
              navigate = useNavigate();
              return null;
            }}
          />
        </Router>
      ),
      document.body
    );
    try {
      navigate("/next", { state: { from: "test" } });
      await vi.waitFor(() => expect(url()).toBe("/next"));
      expect(window.history.state).toEqual({ from: "test", _depth: 4 });
    } finally {
      dispose();
    }
  });

  test("an entry pushed outside the router counts up from the last depth", () => {
    window.history.replaceState({ _depth: 49 }, "", "/");
    vi.spyOn(window.history, "length", "get").mockReturnValue(50);
    const notify = vi.fn();
    const handler = notifyIfNotBlocked(notify, () => false);
    handler(); // record the current depth
    notify.mockClear();
    window.history.pushState(null, "", "/#anchor");
    handler();
    expect(window.history.state._depth).toBe(50);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
