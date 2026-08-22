// Server face of liveQuery: no channels, no multicast — the call hands the
// producer's result through whole, branded as a live source so the signals
// layer applies live SSR policy (document face renders the first value,
// hydration takes over and reconnects on the client).
import { liveQuery } from "../../src/data/liveQuery.js";

const LIVE_SOURCE = Symbol.for("solid.LiveSource");

describe("liveQuery on the server", () => {
  test("passes the source through whole and brands the resolved iterable", async () => {
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      yield "first";
      yield "second";
    }, "ssr-brand");
    const iterable = await (lq() as any);
    expect(iterable[LIVE_SOURCE]).toBe(true);
    // brand is a marker, not a wrapper — the stream consumes as-is (the
    // generator body runs on first pull, so one full consumption = one run)
    const seen: string[] = [];
    for await (const v of iterable) seen.push(v);
    expect(seen).toEqual(["first", "second"]);
    expect(invocations).toBe(1);
  });

  test("brands a synchronously returned iterable too", () => {
    const lq = liveQuery(
      () =>
        (async function* () {
          yield 1;
        })(),
      "ssr-brand-sync"
    );
    expect((lq() as any)[LIVE_SOURCE]).toBe(true);
  });

  test("non-iterable results pass through unbranded", async () => {
    const lq = liveQuery(async () => "plain", "ssr-plain");
    const value = await (lq() as any);
    expect(value).toBe("plain");
  });

  test("request scope: every consumer of a key observes the same first value", async () => {
    const { provideRequestEvent } = await import("@solidjs/web/storage");
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      yield `value-${invocations}`;
      await new Promise(() => {}); // live source stays open
    }, "ssr-dedupe");
    const event = { request: new Request("http://localhost/"), locals: {} } as any;
    await provideRequestEvent(event, async () => {
      // two consumers, document-face style: each takes the first value and
      // closes its iterator (what the signals layer's hybrid policy does)
      const first = async () => {
        const it = (lq() as any)[Symbol.asyncIterator]();
        const r = await it.next();
        await it.return();
        return r.value;
      };
      const a = await first();
      // teardown is microtask-deferred; let it run so the retained record
      // (not the shared connection) serves the later consumer
      await new Promise(r => setTimeout(r, 0));
      const b = await first();
      expect(a).toBe("value-1");
      expect(b).toBe("value-1"); // SAME value — not a second invocation
      expect(invocations).toBe(1);
    });
  });

  test("separate requests do not share channels", async () => {
    const { provideRequestEvent } = await import("@solidjs/web/storage");
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      yield `value-${invocations}`;
    }, "ssr-isolation");
    const first = async () => {
      const it = (lq() as any)[Symbol.asyncIterator]();
      const r = await it.next();
      await it.return();
      return r.value;
    };
    const eventA = { request: new Request("http://localhost/a"), locals: {} } as any;
    const eventB = { request: new Request("http://localhost/b"), locals: {} } as any;
    const a = await provideRequestEvent(eventA, first);
    const b = await provideRequestEvent(eventB, first);
    expect(a).toBe("value-1");
    expect(b).toBe("value-2"); // its own request, its own connection
    expect(invocations).toBe(2);
  });
});
