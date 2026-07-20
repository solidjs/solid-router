import { vi } from "vitest";
import type { FlightDataConsumer } from "@solidjs/web/server-functions";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

// Captures the consumer the router registers so the tests can play the
// transport's part and deliver single-flight payloads to it directly.
let consumer: FlightDataConsumer<Record<string, any>> | undefined;

vi.mock("@solidjs/web/server-functions", () => ({
  decodeResponse: vi.fn(),
  subscribeFlightData: (c: FlightDataConsumer<Record<string, any>>) => {
    consumer = c;
    return () => {
      if (consumer === c) consumer = undefined;
    };
  }
}));

import { setupFlightDataConsumer } from "../../src/data/action.js";
import { query } from "../../src/data/query.js";

describe("setupFlightDataConsumer", () => {
  let router: RouterContext;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query.clear();
    consumer = undefined;
    router = createMockRouter();
    navigate = vi.fn();
    (router as any).navigatorFactory = () => navigate;
  });

  test("registers on setup and unregisters via the returned unsubscribe", () => {
    const unsubscribe = setupFlightDataConsumer(router);
    expect(typeof consumer).toBe("function");
    unsubscribe();
    expect(consumer).toBeUndefined();
  });

  test("seeds query cache entries from the flight payload", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "notes[]": ["fresh-note"], 'user["1"]': { name: "solid" } },
      { response: new Response(null) }
    );
    expect(query.get("notes[]")).toEqual(["fresh-note"]);
    expect(query.get('user["1"]')).toEqual({ name: "solid" });
    expect(navigate).not.toHaveBeenCalled();
  });

  test("navigates for relative redirect locations", async () => {
    setupFlightDataConsumer(router);
    await consumer!(
      { "notes[]": ["destination data"] },
      { response: new Response(null, { headers: { Location: "/notes" } }) }
    );
    expect(navigate).toHaveBeenCalledWith("/notes");
    expect(query.get("notes[]")).toEqual(["destination data"]);
  });

  test("invalidates and reseeds entries named by X-Revalidate", async () => {
    query.set("notes[]", ["stale"]);
    setupFlightDataConsumer(router);
    await consumer!(
      { "notes[]": ["fresh"] },
      { response: new Response(null, { headers: { "X-Revalidate": "notes" } }) }
    );
    expect(query.get("notes[]")).toEqual(["fresh"]);
  });
});
