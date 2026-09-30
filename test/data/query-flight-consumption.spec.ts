import { createRoot } from "solid-js";
import { vi } from "vitest";
import { query } from "../../src/data/query.js";
import { createMockRouter } from "../helpers.js";
import type { Intent } from "../../src/types.js";

const mockRouter = createMockRouter();

// query() only needs the intent/preload accessors and (behind an owner) useRouter.
// Intent is mutable so each test can read through the path it is exercising:
// undefined = hydration / late claim (no navigation in flight), "navigate" /
// "preload" = an active new navigation, "native" = back/forward traversal.
let currentIntent: Intent | undefined;
vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouter,
  getIntent: () => currentIntent,
  getInPreloadFn: () => false
}));
// Whether the read happens while Solid is hydrating (claiming server DOM).
let hydrating = false;
vi.mock("solid-js", async importOriginal => ({
  ...(await importOriginal<typeof import("solid-js")>()),
  isHydrating: () => hydrating
}));

const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;

// The client-side keyed consumption path (takeHydrationValue -> cache
// seeding). The registry is seeded the way the page leaves it: `_$HY.r`
// holding the seroval-revived promise.
function seedFlightEntry(key: string, value: any) {
  (globalThis as any)._$HY = { r: { [key]: Promise.resolve(value) } };
}

function advanceClock(ms: number) {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + ms);
}

describe("query cache freshness windows", () => {
  beforeEach(() => {
    query.clear();
    currentIntent = undefined;
    hydrating = false;
  });

  afterEach(() => {
    delete (globalThis as any)._$HY;
    vi.useRealTimers();
  });

  describe("preload preservation (non-flight)", () => {
    test("a preload within PRELOAD_TIMEOUT satisfies the navigation", async () => {
      return createRoot(async () => {
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "data-" + callCount;
        }, "preloadFresh");

        currentIntent = "preload";
        await cachedFn();
        expect(callCount).toBe(1);

        // Navigate right away: the preloaded entry is inside the short
        // window and satisfies the navigation without a second fetch.
        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("data-1");
        expect(callCount).toBe(1);
      });
    });

    test("a preload older than PRELOAD_TIMEOUT refetches on navigation", async () => {
      return createRoot(async () => {
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "data-" + callCount;
        }, "preloadStale");

        currentIntent = "preload";
        await cachedFn();
        expect(callCount).toBe(1);

        // The user hovered, then thought about it: past the short window
        // the preserved preload no longer satisfies a new navigation.
        advanceClock(PRELOAD_TIMEOUT + 1000);
        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("data-2");
        expect(callCount).toBe(2);
      });
    });
  });

  describe("hydration flight-entry consumption", () => {
    test("hydration burst adopts the flight entry and dedups, one-shot registry", async () => {
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

    test("a late lazy-boundary claim (no navigation) adopts at any age", async () => {
      return createRoot(async () => {
        seedFlightEntry("lateClaim[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "lateClaim");

        // A boundary inside a deferred claim scope (lazy route module)
        // hydrates minutes after stream close (#2964 pattern). No
        // navigation is in flight, and the server DOM was rendered from
        // this exact value — adoption must still happen for consistency.
        advanceClock(10 * 60 * 1000);
        currentIntent = undefined;
        const result = await cachedFn();
        expect(result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("a new navigation refetches instead of adopting an old payload", async () => {
      return createRoot(async () => {
        seedFlightEntry("staleNavigate[]", "stale-server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "staleNavigate");

        // First-ever consumption comes from an active new navigation well
        // past the short window: the payload is not preload-fresh, so the
        // navigation fetches instead of presenting an old value as current.
        advanceClock(10 * 60 * 1000);
        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("fresh-data");
        expect(callCount).toBe(1);
      });
    });

    test("a new navigation adopts a payload still inside the short window", async () => {
      return createRoot(async () => {
        seedFlightEntry("youngNavigate[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "youngNavigate");

        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("back/forward adopts within CACHE_TIMEOUT", async () => {
      return createRoot(async () => {
        seedFlightEntry("nativeRestore[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "nativeRestore");

        // Restoring where the user has been: the payload is a minute old,
        // well within the cache's own retention window.
        advanceClock(60 * 1000);
        currentIntent = "native";
        const result = await cachedFn();
        expect(result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("back/forward past CACHE_TIMEOUT refetches", async () => {
      return createRoot(async () => {
        seedFlightEntry("nativeStale[]", "stale-server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "nativeStale");

        // Past the retention bar an entry the router had fetched itself
        // would already have been swept — the payload gets no more grace.
        advanceClock(CACHE_TIMEOUT + 1000);
        currentIntent = "native";
        const result = await cachedFn();
        expect(result).toBe("fresh-data");
        expect(callCount).toBe(1);
      });
    });

    test("an adopted entry keeps the payload's age: navigation past the short window refetches", async () => {
      return createRoot(async () => {
        seedFlightEntry("adoptedThenNavigate[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "adoptedThenNavigate");

        // Hydration adopts and seeds the cache...
        const adopted = await cachedFn();
        expect(adopted).toBe("server-data");
        expect(callCount).toBe(0);

        // ...but adoption must not grant fetched-now freshness: the entry
        // is stamped at boot, so a navigation past the short window sees
        // the payload's true age and refetches.
        advanceClock(PRELOAD_TIMEOUT + 1000);
        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("fresh-data");
        expect(callCount).toBe(1);
      });
    });

    test("a settled entry adopted inside a hydration trace still resolves for later reads (solid #3721)", async () => {
      return createRoot(async () => {
        // The registry as the page leaves it once the entry's settlement
        // streamed in: the revived promise stamped resolved.
        const revived = Object.assign(Promise.resolve("server-data"), { s: 1, v: "server-data" });
        (globalThis as any)._$HY = { r: { "tracedAdoption[]": revived } };
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "tracedAdoption");

        // Solid's hydration trace: the compute runs once with the global
        // Promise swapped for a mock that never settles.
        class NeverSettles {
          then() {
            return new NeverSettles();
          }
          static resolve() {
            return new NeverSettles();
          }
          static reject() {
            return new NeverSettles();
          }
        }
        const Real = globalThis.Promise;
        globalThis.Promise = NeverSettles as any;
        try {
          cachedFn();
        } finally {
          globalThis.Promise = Real;
        }
        expect("tracedAdoption[]" in (globalThis as any)._$HY.r).toBe(false);

        // A navigation inside the short window reuses the adopted entry.
        currentIntent = "navigate";
        const result = cachedFn();
        expect(result).toBeInstanceOf(Real);
        expect(await result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("an adopted entry satisfies a navigation inside the short window", async () => {
      return createRoot(async () => {
        seedFlightEntry("adoptedThenQuickNavigate[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "adoptedThenQuickNavigate");

        await cachedFn();
        expect(callCount).toBe(0);

        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("a late hydration read reuses the adopted entry at any age (solid #3721)", async () => {
      return createRoot(async () => {
        seedFlightEntry("lateHydrationRead[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "lateHydrationRead");

        // The first reader adopts the one-shot payload and is gone (count 0).
        hydrating = true;
        await cachedFn();
        expect("lateHydrationRead[]" in (globalThis as any)._$HY.r).toBe(false);

        // A boundary resuming past the short window reads the same key while
        // still hydrating: it must not run fn inside the hydration trace.
        advanceClock(PRELOAD_TIMEOUT + 1000);
        const result = await cachedFn();
        expect(result).toBe("server-data");
        expect(callCount).toBe(0);
      });
    });

    test("outside hydration, a stale read with no navigation refetches", async () => {
      return createRoot(async () => {
        seedFlightEntry("staleAfterHydration[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "staleAfterHydration");

        await cachedFn();
        advanceClock(PRELOAD_TIMEOUT + 1000);
        const result = await cachedFn();
        expect(result).toBe("fresh-data");
        expect(callCount).toBe(1);
      });
    });

    test("a navigation during hydration refetches an adopted entry past the short window", async () => {
      return createRoot(async () => {
        seedFlightEntry("navigateWhileHydrating[]", "server-data");
        let callCount = 0;
        const cachedFn = query(async () => {
          callCount++;
          return "fresh-data";
        }, "navigateWhileHydrating");

        hydrating = true;
        await cachedFn();
        advanceClock(PRELOAD_TIMEOUT + 1000);
        currentIntent = "navigate";
        const result = await cachedFn();
        expect(result).toBe("fresh-data");
        expect(callCount).toBe(1);
      });
    });
  });
});
