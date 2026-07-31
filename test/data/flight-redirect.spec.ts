import { vi } from "vitest";
import type { FlightDataConsumer } from "@solidjs/web/server-functions";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

// Captures the consumer the router registers so the tests can play the
// transport's part and deliver single-flight payloads to it directly.
let consumer: FlightDataConsumer<Record<string, any>> | undefined;

vi.mock("@solidjs/web/server-functions", () => ({
  decodeResponse: vi.fn(),
  decodeResponsePayload: vi.fn(),
  // consumed by data/query.ts, which shares this module graph
  isServerFunction: () => false,
  getServerFunctionMetadata: () => undefined,
  subscribeFlightData: (c: FlightDataConsumer<Record<string, any>>) => {
    consumer = c;
    return () => {
      if (consumer === c) consumer = undefined;
    };
  }
}));

// Spy on the sweep: these tests pin the ordering the action layer applies to
// a flight response — invalidate, seed, navigate, then sweep synchronously —
// not the query cache mechanics (covered by query.spec.ts and
// flight-consumer.spec.ts).
const hoisted = vi.hoisted(() => ({
  sweepSpy: vi.fn(),
  actualQuery: undefined as unknown as typeof import("../../src/data/query.js")
}));
const { sweepSpy } = hoisted;
vi.mock("../../src/data/query.js", async importOriginal => {
  hoisted.actualQuery = await importOriginal<typeof import("../../src/data/query.js")>();
  return {
    ...hoisted.actualQuery,
    revalidate: (...args: unknown[]) => hoisted.sweepSpy(...args)
  };
});

import { setupFlightDataConsumer } from "../../src/data/action.js";
import { query } from "../../src/data/query.js";

// A redirecting flight response commits atomically: the sweep runs in the
// same synchronous pass as the navigation so both join one transition.
// Surviving consumers the payload didn't seed refetch and hold the commit
// instead of painting stale at the destination and updating after; seeded
// entries are fresh again by sweep time, so they re-read from cache.
describe("redirecting flight responses", () => {
  let router: RouterContext;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query.clear();
    consumer = undefined;
    sweepSpy.mockClear();
    router = createMockRouter();
    navigate = vi.fn();
    (router as any).navigatorFactory = () => (url: string) => navigate(url);
  });

  test("a redirect seeds, navigates, and sweeps in one synchronous pass", async () => {
    setupFlightDataConsumer(router);
    let sweptDuringApply = false;
    sweepSpy.mockImplementationOnce(() => {
      sweptDuringApply = true;
      // by sweep time the payload is already seeded and the navigation issued
      expect(query.get("note[0]")).toEqual({ title: "fresh" });
      expect(navigate).toHaveBeenCalledWith("/notes/0");
    });
    await consumer!(
      { "note[0]": { title: "fresh" } },
      { response: new Response(null, { headers: { Location: "/notes/0" } }) }
    );
    expect(sweptDuringApply).toBe(true);
    expect(sweepSpy).toHaveBeenCalledTimes(1);
  });

  test("the sweep carries X-Revalidate keys, non-forcing", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "notes[]": ["fresh"] },
      {
        response: new Response(null, {
          headers: { Location: "/notes", "X-Revalidate": "notes" }
        })
      }
    );
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(sweepSpy).toHaveBeenCalledWith(["notes"], false);
  });

  test("a response without a redirect sweeps the same way", async () => {
    setupFlightDataConsumer(router);
    await consumer!({ "notes[]": ["fresh"] }, { response: new Response(null) });
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(sweepSpy).toHaveBeenCalledWith(undefined, false);
  });

  test("a hard (absolute) redirect still sweeps", async () => {
    const original = window.location;
    Object.defineProperty(window, "location", {
      value: { ...original, href: original.href },
      writable: true,
      configurable: true
    });
    try {
      setupFlightDataConsumer(router);
      await consumer!({}, {
        response: new Response(null, { headers: { Location: "https://elsewhere.example/" } })
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(sweepSpy).toHaveBeenCalledTimes(1);
      expect(sweepSpy).toHaveBeenCalledWith(undefined, false);
    } finally {
      Object.defineProperty(window, "location", { value: original, configurable: true });
    }
  });
});
