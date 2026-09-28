import { afterEach, describe, expect, test, vi } from "vitest";
import { browserHistory } from "../src/index.js";

describe("browserHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  test("does not throw when replaceState leaves history.state null", () => {
    vi.spyOn(window.history, "state", "get").mockReturnValue(null);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    expect(() => browserHistory()).not.toThrow();
  });
});
