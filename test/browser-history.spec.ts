import { afterEach, describe, expect, test, vi } from "vitest";
import { browserHistory, hashHistory } from "../src/index.js";

describe("browserHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  test("does not throw when replaceState leaves history.state null", () => {
    vi.spyOn(window.history, "state", "get").mockReturnValue(null);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    expect(() => browserHistory()).not.toThrow();
  });

  // #694: browsers cap session history (50 entries in Chromium and Firefox).
  // Once full, a push drops the oldest entry and history.length stops growing.
  test("stamps increasing depths on push when history.length is capped", () => {
    window.history.replaceState({ _depth: 48 }, "", "/");
    vi.spyOn(window.history, "length", "get").mockReturnValue(50);
    const history = browserHistory();

    const depths: number[] = [];
    for (let i = 1; i <= 3; i++) {
      history.set({ value: `/${i}` });
      depths.push(window.history.state._depth);
    }
    expect(depths).toEqual([49, 50, 51]);

    history.set({ value: "/3?replaced", replace: true });
    expect(window.history.state._depth).toBe(51);
  });

  test("keeps user state when stamping the depth on push", () => {
    window.history.replaceState({ _depth: 3 }, "", "/");
    const history = browserHistory();
    history.set({ value: "/next", state: { from: "test" } });
    expect(window.history.state).toEqual({ from: "test", _depth: 4 });
  });

  test("hashHistory stamps increasing depths on push when history.length is capped", () => {
    window.history.replaceState({ _depth: 48 }, "", "/");
    vi.spyOn(window.history, "length", "get").mockReturnValue(50);
    const history = hashHistory();

    const depths: number[] = [];
    for (let i = 1; i <= 3; i++) {
      history.set({ value: `/${i}` });
      depths.push(window.history.state._depth);
    }
    expect(depths).toEqual([49, 50, 51]);
  });
});
