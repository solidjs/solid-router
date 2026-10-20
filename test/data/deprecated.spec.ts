import { DEV } from "solid-js";
import { vi } from "vitest";
import { action } from "../../src/data/deprecated.js";
import { formAction } from "../../src/data/action.js";

describe("deprecated action alias", () => {
  afterEach(() => vi.restoreAllMocks());

  test("is formAction outside dev", () => {
    if (DEV) return;
    expect(action).toBe(formAction);
  });

  test("warns once in dev, naming formAction, and still creates a form action", () => {
    if (!DEV) return;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = action(async () => {}, "deprecated-alias-a");
    action(async () => {}, "deprecated-alias-b");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("`action` is deprecated");
    expect(warn.mock.calls[0][0]).toContain("`formAction`");
    expect(a.url).toBe(formAction(async () => {}, "deprecated-alias-a").url);
  });
});
