import { vi } from "vitest";
import type { FlightDataConsumer } from "@solidjs/web/server-functions";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

// Captures the consumer the router registers so the tests can play the
// transport's part and deliver single-flight payloads to it directly.
let consumer: FlightDataConsumer<Record<string, any>> | undefined;

// The wire shape of a scripted redirect: masked 200 with the carrier holding
// the author's status and the target resolved to an absolute url.
const carrier = (target: string, status = 302) => ({
  "X-Server-Function-Redirect": `${status} ${new URL(target, window.location.href).href}`
});

vi.mock("@solidjs/web/server-functions", () => ({
  decodeResponse: vi.fn(),
  decodeResponsePayload: vi.fn(),
  // the redirect carrier, mirrored from the runtime (wire format:
  // "<status> <absolute-url>")
  REDIRECT_HEADER: "X-Server-Function-Redirect",
  decodeRedirectHeaderValue: (value: string | null | undefined) => {
    if (typeof value !== "string") return undefined;
    const at = value.indexOf(" ");
    if (at < 0) return undefined;
    const status = Number(value.slice(0, at));
    const url = value.slice(at + 1);
    if (!Number.isInteger(status) || !url) return undefined;
    return { status, url };
  },
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

import { action } from "../../src/data/action.js";
import { setupFlightDataConsumer } from "../../src/data/query.js";
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
      { response: new Response(null, { headers: carrier("/notes") }) }
    );
    expect(navigate).toHaveBeenCalledWith("/notes", { replace: true, resolve: true });
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

  test("X-Revalidate: * revalidates everything, the same scope as no declaration", async () => {
    // `revalidate: "*"` is the host-independent spelling of "all" — the
    // author's explicit version of what this router already does for an
    // action that declares nothing. Entries outside any named prefix go
    // stale too; the payload's own entries are fresh again by the sweep.
    const fetchOther = vi.fn(async () => "other");
    const other = query(fetchOther, "other");
    await other();
    query.set("notes[]", ["stale"]);

    setupFlightDataConsumer(router);
    const save = async () => {
      await consumer!(
        { "notes[]": ["fresh"] },
        { response: new Response(null, { headers: { "X-Revalidate": "*" } }) }
      );
      return "saved";
    };
    await action(save, "save-all").call({ r: router });
    await other();

    expect(query.get("notes[]")).toEqual(["fresh"]);
    expect(fetchOther).toHaveBeenCalledTimes(2);
  });

  test("an empty X-Revalidate declaration revalidates nothing", async () => {
    // `revalidate: []` narrows the scope to zero keys — distinct from the
    // absent header, which is this router's "everything" default.
    const fetchOther = vi.fn(async () => "other");
    const other = query(fetchOther, "other");
    await other();

    setupFlightDataConsumer(router);
    const save = async () => {
      await consumer!({}, { response: new Response(null, { headers: { "X-Revalidate": "" } }) });
      return "saved";
    };
    await action(save, "save-nothing").call({ r: router });
    await other();

    expect(fetchOther).toHaveBeenCalledTimes(1);
  });

  test("does not revalidate flight data again after a server action settles", async () => {
    const fetchNotes = vi.fn(async () => ["stale"]);
    const notes = query(fetchNotes, "notes");
    await notes();

    setupFlightDataConsumer(router);
    // plays the transport: the consumer is invoked (and awaited) before the
    // mutation resolves with its unwrapped plain value
    const save = async () => {
      await consumer!(
        { "notes[]": ["fresh"] },
        { response: new Response(null, { headers: { "X-Revalidate": "notes" } }) }
      );
      return "saved";
    };

    await action(save, "save-notes").call({ r: router });

    expect(await notes()).toEqual(["fresh"]);
    expect(fetchNotes).toHaveBeenCalledTimes(1);
  });

  test("adopts a keyless flight payload without refetching the seeded queries", async () => {
    // the keyless single-flight redirect: invalidation is blanket (no
    // X-Revalidate header), but entries the payload seeded are fresh again
    // by the time the revalidation sweep runs — the shared layout's query
    // adopts the server's value with no second fetch
    const fetchLayout = vi.fn(async () => "stale-layout");
    const layout = query(fetchLayout, "layout");
    await layout();

    setupFlightDataConsumer(router);
    const save = async () => {
      await consumer!(
        { "layout[]": "fresh-layout" },
        { response: new Response(null, { headers: carrier("/dash/b") }) }
      );
      return "saved";
    };
    await action(save, "keyless-save").call({ r: router });

    expect(navigate).toHaveBeenCalledWith("/dash/b", { replace: true, resolve: true });
    expect(await layout()).toBe("fresh-layout");
    expect(fetchLayout).toHaveBeenCalledTimes(1);
  });

  test("a keyless flight response still revalidates queries missing from the payload", async () => {
    // the #407 default: single flight only collects preload-reachable
    // queries, so a keyless mutation must still invalidate everything else —
    // a cached query absent from the payload refetches on its next read
    const fetchOther = vi.fn(async () => "other");
    const other = query(fetchOther, "other");
    await other();

    setupFlightDataConsumer(router);
    const save = async () => {
      await consumer!({ "layout[]": "fresh-layout" }, { response: new Response(null) });
      return "saved";
    };
    await action(save, "keyless-save").call({ r: router });
    await other();

    expect(fetchOther).toHaveBeenCalledTimes(2);
  });

  test("continues to revalidate plain client action results", async () => {
    const fetchNotes = vi.fn(async () => ["notes"]);
    const notes = query(fetchNotes, "notes");
    await notes();

    await action(async () => "saved", "save-notes").call({ r: router });
    await notes();

    expect(fetchNotes).toHaveBeenCalledTimes(2);
  });

  test("still revalidates a server mutation whose response carried no flight data", async () => {
    const fetchNotes = vi.fn(async () => ["notes"]);
    const notes = query(fetchNotes, "notes");
    await notes();

    // consumer registered (single flight on), but the server returned a bare
    // value — no X-Single-Flight response header, so the transport never
    // invokes the consumer (no referrer, empty collection pass, or no
    // server-side collector). The default revalidation must still run.
    setupFlightDataConsumer(router);
    await action(async () => "saved", "save-notes").call({ r: router });
    await notes();

    expect(fetchNotes).toHaveBeenCalledTimes(2);
  });
});
