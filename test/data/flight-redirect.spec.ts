import { vi } from "vitest";
import { createSignal, flush } from "solid-js";
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

// Spy on the sweep scheduler: these tests pin the *decision* the action layer
// makes for a redirect — defer the sweep behind the navigation transition
// (isRouting passed) or run it immediately (no second argument) — not the
// query cache mechanics (covered by query.spec.ts and flight-consumer.spec.ts).
// The defer timing itself is unit-tested against the real `revalidateOnSettle`
// below.
const hoisted = vi.hoisted(() => ({
  sweepSpy: vi.fn(),
  actualQuery: undefined as unknown as typeof import("../../src/data/query.js")
}));
const { sweepSpy } = hoisted;
vi.mock("../../src/data/query.js", async importOriginal => {
  hoisted.actualQuery = await importOriginal<typeof import("../../src/data/query.js")>();
  return {
    ...hoisted.actualQuery,
    revalidateOnSettle: (...args: unknown[]) => hoisted.sweepSpy(...args)
  };
});

import { setupFlightDataConsumer } from "../../src/data/action.js";
import { query, cacheKeyOp } from "../../src/data/query.js";
import type { CacheEntry } from "../../src/types.js";

// A redirecting flight response must not sweep queries whose only
// subscribers sit under the route being left: the payload covers the
// destination's data, not the outgoing route's, so an immediate sweep
// refires the outgoing route's live queries and buys fetches whose results
// unmount with the route — a second round trip on what should be a
// single-flight mutation. The sweep defers until the navigation transition
// settles; invalidation and cache seeding stay immediate.
describe("redirecting flight responses and outgoing routes", () => {
  let router: RouterContext;
  let navigate: ReturnType<typeof vi.fn>;
  let setRouting: (v: boolean) => void;

  beforeEach(() => {
    query.clear();
    consumer = undefined;
    sweepSpy.mockClear();
    router = createMockRouter();
    navigate = vi.fn();
    const [routing, set] = createSignal(false);
    setRouting = set;
    (router as any).isRouting = routing;
    (router as any).navigatorFactory = () => (url: string) => {
      navigate(url);
      setRouting(true); // the navigation forks a transition
    };
  });

  test("a redirect defers the sweep behind the navigation transition", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "note[0]": { title: "fresh" } },
      { response: new Response(null, { headers: { Location: "/notes/0" } }) }
    );
    flush();
    expect(navigate).toHaveBeenCalledWith("/notes/0");
    // seeding is immediate…
    expect(query.get("note[0]")).toEqual({ title: "fresh" });
    // …while the sweep is scheduled against the transition
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(sweepSpy).toHaveBeenCalledWith(undefined, (router as any).isRouting);
  });

  test("the deferred sweep keeps X-Revalidate keys", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "notes[]": ["fresh"] },
      {
        response: new Response(null, {
          headers: { Location: "/notes", "X-Revalidate": "notes" }
        })
      }
    );
    flush();
    expect(sweepSpy).toHaveBeenCalledWith(["notes"], (router as any).isRouting);
  });

  test("a response without a redirect sweeps immediately", async () => {
    setupFlightDataConsumer(router);
    await consumer!({ "notes[]": ["fresh"] }, { response: new Response(null) });
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(sweepSpy).toHaveBeenCalledWith(undefined, undefined);
  });

  test("a hard (absolute) redirect sweeps immediately", async () => {
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
      expect(sweepSpy).toHaveBeenCalledWith(undefined, undefined);
    } finally {
      Object.defineProperty(window, "location", { value: original, configurable: true });
    }
  });

  test("revalidateOnSettle holds the sweep until isRouting settles", async () => {
    query.set("rvs-note", "seeded");
    let entry!: CacheEntry;
    cacheKeyOp("rvs-note", e => (entry = e));
    const versionBefore = entry[4][0]();

    await new Promise(r => setTimeout(r, 2)); // ensure a new Date.now() stamp
    const [routing, set] = createSignal(true);
    hoisted.actualQuery.revalidateOnSettle(["rvs-note"], routing);
    flush();
    // transition still in flight: no sweep, live signal untouched
    expect(entry[4][0]()).toBe(versionBefore);

    set(false);
    flush();
    expect(entry[4][0]()).not.toBe(versionBefore);
  });

  test("revalidateOnSettle without a transition sweeps immediately", async () => {
    query.set("rvs-now", "seeded");
    let entry!: CacheEntry;
    cacheKeyOp("rvs-now", e => (entry = e));
    const versionBefore = entry[4][0]();

    await new Promise(r => setTimeout(r, 2));
    hoisted.actualQuery.revalidateOnSettle(["rvs-now"]);
    flush();
    expect(entry[4][0]()).not.toBe(versionBefore);
  });
});
