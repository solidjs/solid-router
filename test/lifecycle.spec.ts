import { vi } from "vitest";
import { createBeforeLeave } from "../src/lifecycle.js";
import type { BeforeLeaveEventArgs, Location } from "../src/types.js";

const mockLocation = { pathname: "/", search: "", hash: "", query: {}, state: null, key: "" } as unknown as Location;

describe("createBeforeLeave", () => {
  test("confirm returns false when a listener prevents default", () => {
    const beforeLeave = createBeforeLeave();
    beforeLeave.subscribe({
      listener: e => e.preventDefault(),
      location: mockLocation,
      navigate: vi.fn()
    });

    expect(beforeLeave.confirm("/next")).toBe(false);
  });

  test("earlier listeners observe preventDefault called by later listeners", () => {
    const beforeLeave = createBeforeLeave();
    let captured!: BeforeLeaveEventArgs;

    beforeLeave.subscribe({
      listener: e => (captured = e),
      location: mockLocation,
      navigate: vi.fn()
    });
    beforeLeave.subscribe({
      listener: e => e.preventDefault(),
      location: mockLocation,
      navigate: vi.fn()
    });

    beforeLeave.confirm("/next");
    expect(captured.defaultPrevented).toBe(true);
  });

  test("unsubscribe removes the listener", () => {
    const beforeLeave = createBeforeLeave();
    const listener = vi.fn();
    const unsubscribe = beforeLeave.subscribe({
      listener,
      location: mockLocation,
      navigate: vi.fn()
    });

    unsubscribe();
    expect(beforeLeave.confirm("/next")).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
