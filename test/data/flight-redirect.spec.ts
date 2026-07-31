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

// Spy on the revalidation sweep itself: these tests pin *when* the sweep
// runs relative to a redirect's navigation transition, not the query cache
// mechanics (covered by query.spec.ts and flight-consumer.spec.ts).
const revalidateSpy = vi.fn();
vi.mock("../../src/data/query.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/data/query.js")>();
  return {
    ...actual,
    revalidate: (...args: unknown[]) => revalidateSpy(...args)
  };
});

import { setupFlightDataConsumer } from "../../src/data/action.js";
import { query } from "../../src/data/query.js";

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
    revalidateSpy.mockClear();
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

  test("defers the revalidation sweep until the redirect's transition settles", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "note[0]": { title: "fresh" } },
      { response: new Response(null, { headers: { Location: "/notes/0" } }) }
    );
    flush();
    expect(navigate).toHaveBeenCalledWith("/notes/0");
    // seeding is immediate…
    expect(query.get("note[0]")).toEqual({ title: "fresh" });
    // …but the sweep waits out the transition
    expect(revalidateSpy).not.toHaveBeenCalled();

    setRouting(false);
    flush();
    expect(revalidateSpy).toHaveBeenCalledTimes(1);
    expect(revalidateSpy).toHaveBeenCalledWith(undefined, false);
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
    expect(revalidateSpy).not.toHaveBeenCalled();

    setRouting(false);
    flush();
    expect(revalidateSpy).toHaveBeenCalledWith(["notes"], false);
  });

  test("a response without a redirect sweeps immediately", async () => {
    setupFlightDataConsumer(router);
    await consumer!({ "notes[]": ["fresh"] }, { response: new Response(null) });
    expect(revalidateSpy).toHaveBeenCalledTimes(1);
    expect(revalidateSpy).toHaveBeenCalledWith(undefined, false);
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
      expect(revalidateSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { value: original, configurable: true });
    }
  });
});
