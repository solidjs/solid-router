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

import { action, setupFlightDataConsumer } from "../../src/data/action.js";
import { query } from "../../src/data/query.js";
import { registerFlightRouter } from "../../src/routing.js";

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

// The Router no longer imports setupFlightDataConsumer; it registers itself
// into a rendezvous in routing.ts, and the action side provides the
// consumer factory on first action creation. These tests exercise the
// rendezvous ordering on fresh module instances (the slots are
// module-global and first-provide-wins).
describe("flight consumer rendezvous", () => {
  const loadRouting = async () => {
    vi.resetModules();
    return await import("../../src/routing.js");
  };

  test("provide before register subscribes at registration and unsubscribes on cleanup", async () => {
    const { registerFlightRouter, provideFlightConsumer } = await loadRouting();
    const unsubscribe = vi.fn();
    const factory = vi.fn(() => unsubscribe);
    provideFlightConsumer(factory);

    const router = createMockRouter();
    const cleanup = registerFlightRouter(router);
    expect(factory).toHaveBeenCalledWith(router);

    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });

  test("register before provide attaches when the consumer arrives", async () => {
    const { registerFlightRouter, provideFlightConsumer } = await loadRouting();
    const unsubscribe = vi.fn();
    const factory = vi.fn(() => unsubscribe);

    const router = createMockRouter();
    const cleanup = registerFlightRouter(router);
    expect(factory).not.toHaveBeenCalled();

    provideFlightConsumer(factory);
    expect(factory).toHaveBeenCalledWith(router);

    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });

  test("a router unregistered before the consumer arrives is never subscribed", async () => {
    const { registerFlightRouter, provideFlightConsumer } = await loadRouting();
    const factory = vi.fn(() => vi.fn());

    const cleanup = registerFlightRouter(createMockRouter());
    cleanup();

    provideFlightConsumer(factory);
    expect(factory).not.toHaveBeenCalled();
  });

  test("the first provided consumer wins", async () => {
    const { registerFlightRouter, provideFlightConsumer } = await loadRouting();
    const first = vi.fn(() => vi.fn());
    const second = vi.fn(() => vi.fn());

    provideFlightConsumer(first);
    provideFlightConsumer(second);
    registerFlightRouter(createMockRouter());

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  // End-to-end over the real modules (static imports above): creating an
  // action provides setupFlightDataConsumer, which subscribes for the
  // already-registered router through the mocked transport.
  test("creating an action installs the consumer for a registered router", () => {
    consumer = undefined;
    const cleanup = registerFlightRouter(createMockRouter());

    action(async () => "result", "rendezvous-install-test");
    expect(typeof consumer).toBe("function");

    cleanup();
    expect(consumer).toBeUndefined();
  });
});
