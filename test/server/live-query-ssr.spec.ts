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
});
