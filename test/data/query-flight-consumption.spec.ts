import { createRoot, sharedConfig } from "solid-js";
import { vi } from "vitest";
import { query } from "../../src/data/query.js";
import { createMockRouter } from "../helpers.js";

const mockRouter = createMockRouter();

// query() only needs the intent/preload accessors and (behind an owner) useRouter.
vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouter,
  getIntent: () => "navigate",
  getInPreloadFn: () => false
}));

// The client-side keyed consumption path (sharedConfig.has/load -> cache
// seeding). The registry is seeded the way hydrate() leaves it: `_$HY.r`
// holding the seroval-revived promise, sharedConfig.has/load reading it.
function seedFlightEntry(key: string, value: any) {
  (globalThis as any)._$HY = { r: { [key]: Promise.resolve(value) } };
  sharedConfig.has = k => k in (globalThis as any)._$HY.r;
  sharedConfig.load = k => (globalThis as any)._$HY.r[k];
}

describe("hydration flight-entry consumption", () => {
  beforeEach(() => {
    query.clear();
  });

  afterEach(() => {
    sharedConfig.has = undefined;
    sharedConfig.load = undefined;
    delete (globalThis as any)._$HY;
    vi.useRealTimers();
  });

  test("adopts a flight entry consumed while the payload is current, one-shot", async () => {
    return createRoot(async () => {
      seedFlightEntry("flightQuery[]", "server-data");
      let callCount = 0;
      const cachedFn = query(async () => {
        callCount++;
        return "fresh-data";
      }, "flightQuery");

      // First call adopts the server value instead of fetching...
      const adopted = await cachedFn();
      expect(adopted).toBe("server-data");
      expect(callCount).toBe(0);
      // ...consumption is one-shot (the raw registry entry is deleted)...
      expect("flightQuery[]" in (globalThis as any)._$HY.r).toBe(false);
      // ...and the seeded cache entry replays for the consumption burst
      // (preload + render call the same key back to back).
      const replayed = await cachedFn();
      expect(replayed).toBe("server-data");
      expect(callCount).toBe(0);
    });
  });

  test("a flight entry first consumed long after load is stale — refetch, don't adopt", async () => {
    return createRoot(async () => {
      seedFlightEntry("lateQuery[]", "stale-server-data");
      let callCount = 0;
      const cachedFn = query(async () => {
        callCount++;
        return "fresh-data";
      }, "lateQuery");

      // The entry arrived with the page, but nothing consumed it until long
      // past the cache's own retention tolerance (CACHE_TIMEOUT, 180s) — an
      // idle tab, a late client-side navigation. The serialized value is
      // minutes old; adopting it and stamping it fresh would mask its age
      // from query()'s staleness logic entirely.
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);

      const result = await cachedFn();
      expect(result).toBe("fresh-data");
      expect(callCount).toBe(1);
    });
  });
});
