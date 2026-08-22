import { vi } from "vitest";
import { flush } from "solid-js";
import { liveQuery } from "../../src/data/liveQuery.js";
import { deliverFlightData, revalidate } from "../../src/data/query.js";

// Router intent is module-private state set by the preload machinery;
// mock only getIntent so preload-warming is testable without a full router.
const routerState = vi.hoisted(() => ({ intent: undefined as string | undefined }));
vi.mock("../../src/routing.js", async importOriginal => ({
  ...(await importOriginal<any>()),
  getIntent: () => routerState.intent
}));

// A controllable value-shaped producer: each invocation is its own stream
// (the live contract — re-yield current state per connection). push() feeds
// every open stream; end() completes them.
function makeProducer() {
  const streams = new Set<{
    queue: any[];
    ended: boolean;
    wake: (() => void) | undefined;
    returned: boolean;
  }>();
  let invocations = 0;
  const fn = (..._args: any[]) => {
    invocations++;
    const state = {
      queue: [] as any[],
      ended: false,
      wake: undefined as (() => void) | undefined,
      returned: false
    };
    streams.add(state);
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            while (true) {
              if (state.queue.length) return { done: false, value: state.queue.shift() };
              if (state.ended) return { done: true, value: undefined };
              await new Promise<void>(r => (state.wake = r));
            }
          },
          return(value?: any) {
            state.returned = true;
            state.ended = true;
            streams.delete(state);
            return Promise.resolve({ done: true, value });
          }
        };
      }
    };
  };
  return {
    fn,
    get invocations() {
      return invocations;
    },
    get open() {
      return streams.size;
    },
    get anyReturned() {
      return [...streams].some(s => s.returned);
    },
    push(v: any) {
      for (const s of streams) {
        s.queue.push(v);
        s.wake?.();
        s.wake = undefined;
      }
    },
    end() {
      for (const s of streams) {
        s.ended = true;
        s.wake?.();
        s.wake = undefined;
      }
      streams.clear();
    }
  };
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));

let nameCounter = 0;
const uniqueName = () => `lq-test-${nameCounter++}`;

describe("liveQuery", () => {
  test("callable carries the query conventions", () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, "rooms");
    expect(lq.key).toBe("rooms");
    expect(lq.keyFor(42)).toBe("rooms[42]");
    expect(lq.status(42)).toBe("idle");
  });

  test("connection is lazy: calling opens nothing, first pull connects", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const iterable = lq(1);
    await tick();
    expect(producer.invocations).toBe(0);
    const it = iterable[Symbol.asyncIterator]();
    const first = it.next();
    await tick();
    expect(producer.invocations).toBe(1);
    producer.push("a");
    expect((await first).value).toBe("a");
    await it.return!();
  });

  test("the returned iterable is live-branded for SSR/hydration policy", () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    expect((lq(1) as any)[Symbol.for("solid.LiveSource")]).toBe(true);
  });

  test("consumers of one key share a single connection", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq("room")[Symbol.asyncIterator]();
    const b = lq("room")[Symbol.asyncIterator]();
    const firstA = a.next();
    const firstB = b.next();
    await tick();
    expect(producer.invocations).toBe(1);
    producer.push("hello");
    expect((await firstA).value).toBe("hello");
    expect((await firstB).value).toBe("hello");
    await a.return!();
    await b.return!();
  });

  test("different args are different channels", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq("x")[Symbol.asyncIterator]();
    const b = lq("y")[Symbol.asyncIterator]();
    const pa = a.next();
    const pb = b.next();
    await tick();
    expect(producer.invocations).toBe(2);
    producer.push("v");
    await pa;
    await pb;
    await a.return!();
    await b.return!();
  });

  test("late subscribers replay the latest value immediately", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    const firstA = a.next();
    await tick();
    producer.push("v1");
    producer.push("v2");
    expect((await firstA).value).toBe("v1");
    expect((await a.next()).value).toBe("v2");
    // b arrives after v2 was delivered: it must not wait for a fresh yield
    const b = lq()[Symbol.asyncIterator]();
    expect((await b.next()).value).toBe("v2");
    expect(producer.invocations).toBe(1);
    await a.return!();
    await b.return!();
  });

  test("delivery is latest-wins: a slow consumer skips intermediates", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    const first = a.next();
    await tick();
    producer.push("v1");
    await first;
    // three yields while the consumer isn't pulling
    producer.push("v2");
    producer.push("v3");
    producer.push("v4");
    await tick();
    expect((await a.next()).value).toBe("v4");
    await a.return!();
  });

  test("last consumer leaving closes the producer and drops the channel", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("v");
    await p;
    expect(producer.open).toBe(1);
    await a.return!();
    await tick(); // teardown is microtask-deferred
    expect(producer.open).toBe(0);
    // a fresh subscribe reconnects
    const b = lq()[Symbol.asyncIterator]();
    const p2 = b.next();
    await tick();
    expect(producer.invocations).toBe(2);
    producer.push("v2");
    expect((await p2).value).toBe("v2");
    await b.return!();
  });

  test("same-tick resubscribe (memo re-run) keeps the connection", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("v");
    await p;
    // rerun: old iterator released and a new one subscribed synchronously
    const done = a.return!();
    const b = lq()[Symbol.asyncIterator]();
    const p2 = b.next();
    await done;
    await tick();
    expect(producer.invocations).toBe(1); // no thrash
    expect((await p2).value).toBe("v"); // replayed latest
    await b.return!();
  });

  test("source completion completes every consumer", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    const b = lq()[Symbol.asyncIterator]();
    const pa = a.next();
    const pb = b.next();
    await tick();
    producer.push("v");
    await pa;
    await pb;
    producer.end();
    expect((await a.next()).done).toBe(true);
    expect((await b.next()).done).toBe(true);
  });

  test("first-connect failure rejects the consumer", async () => {
    const lq = liveQuery(async () => {
      throw new Error("nope");
    }, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    await expect(a.next()).rejects.toThrow("nope");
  });

  test("a connected stream dying reconnects: liveQuery IS the live layer", async () => {
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      if (invocations === 1) {
        yield "a";
        throw new Error("mid-stream death");
      }
      yield "b";
    }, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    expect((await a.next()).value).toBe("a");
    // the death is invisible to the consumer: backoff (500ms first retry),
    // reconnect, and the fresh yield flows through the same channel
    const started = Date.now();
    expect((await a.next()).value).toBe("b");
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    expect(invocations).toBe(2);
    // the second (healthy) completion ends the channel
    expect((await a.next()).done).toBe(true);
  }, 10000);

  test("reconnect keeps serving the latest value to late subscribers", async () => {
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      yield `v${invocations}`;
      if (invocations === 1) throw new Error("death");
      await new Promise(() => {}); // healthy stream stays open
    }, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    expect((await a.next()).value).toBe("v1");
    // while the channel is mid-backoff, a new subscriber still gets v1
    const b = lq()[Symbol.asyncIterator]();
    expect((await b.next()).value).toBe("v1");
    expect((await b.next()).value).toBe("v2");
    await a.return!();
    await b.return!();
  }, 10000);

  test("revalidate(key) reconnects the channel; subscribers survive", async () => {
    const producer = makeProducer();
    const name = uniqueName();
    const lq = liveQuery(producer.fn, name);
    const a = lq("room")[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("stale");
    expect((await p).value).toBe("stale");

    revalidate(lq.keyFor("room"));
    await tick();
    expect(producer.invocations).toBe(2);
    producer.push("fresh");
    expect((await a.next()).value).toBe("fresh");
    await a.return!();
  });

  test("post-mutation sweep (force=false) leaves the healthy connection alone", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq("room")[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("v1");
    expect((await p).value).toBe("v1");
    // what applyResponseMetadata runs after seeding flight data — the live
    // connection is its own freshness mechanism, no reconnect
    revalidate(lq.keyFor("room"), false);
    await tick();
    expect(producer.invocations).toBe(1);
    // the stream is still the same, still delivering
    producer.push("v2");
    expect((await a.next()).value).toBe("v2");
    await a.return!();
  });

  test("single-flight payloads deliver into open channels", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq("room")[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("stale");
    expect((await p).value).toBe("stale");
    // the mutation's response carried fresh data for this key: it lands in
    // the channel without a reconnect — the mutation IS the round trip
    deliverFlightData({ [lq.keyFor("room")]: "mutated" });
    expect((await a.next()).value).toBe("mutated");
    expect(producer.invocations).toBe(1);
    // and the live stream stays authoritative afterwards
    producer.push("post-mutation push");
    expect((await a.next()).value).toBe("post-mutation push");
    await a.return!();
  });

  test("stream-shaped flight values adopt yields for as long as they run", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    const a = lq("room")[Symbol.asyncIterator]();
    const p = a.next();
    await tick();
    producer.push("v0");
    await p;
    deliverFlightData({
      [lq.keyFor("room")]: (async function* () {
        yield "f1";
        yield "f2";
      })()
    });
    expect((await a.next()).value).toBe("f1");
    expect((await a.next()).value).toBe("f2");
    expect(producer.invocations).toBe(1);
    await a.return!();
  });

  test("flight delivery for keys without channels is inert", () => {
    // no channel open — must not throw or create one
    liveQuery(makeProducer().fn, uniqueName()); // ensures hooks are registered
    expect(() => deliverFlightData({ "nowhere[1]": "value" })).not.toThrow();
  });

  test("revalidate by bare name matches every args-variant (prefix match)", async () => {
    const producer = makeProducer();
    const name = uniqueName();
    const lq = liveQuery(producer.fn, name);
    const a = lq("x")[Symbol.asyncIterator]();
    const b = lq("y")[Symbol.asyncIterator]();
    const pa = a.next();
    const pb = b.next();
    await tick();
    producer.push("v");
    await pa;
    await pb;
    revalidate(name);
    await tick();
    expect(producer.invocations).toBe(4); // both channels reconnected
    await a.return!();
    await b.return!();
  });

  test("status reflects the channel lifecycle", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    expect(lq.status()).toBe("idle");
    const a = lq()[Symbol.asyncIterator]();
    const p = a.next();
    flush();
    expect(lq.status()).toBe("connecting");
    await tick();
    producer.push("v");
    await p;
    flush();
    expect(lq.status()).toBe("connected");
    await a.return!();
    await tick();
    flush();
    expect(lq.status()).toBe("idle");
  });

  test("a definite rejection (4xx) ends the channel: error surfaces, no retry", async () => {
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      yield "granted";
      // the transport stamps HTTP statuses onto failures — 4xx means the
      // server understood and refused, so retrying cannot change the answer
      throw Object.assign(new Error("revoked"), { status: 403 });
    }, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    expect((await a.next()).value).toBe("granted");
    await expect(a.next()).rejects.toThrow("revoked");
    expect(invocations).toBe(1); // no reconnect attempt
    flush();
    expect(lq.status()).toBe("closed");
  });

  test("preload intent warms the channel ahead of navigation", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    routerState.intent = "preload";
    try {
      lq(7); // the preload call — no consumer, but the channel connects
    } finally {
      routerState.intent = undefined;
    }
    await tick();
    expect(producer.invocations).toBe(1);
    producer.push("warm");
    await tick();
    // navigation renders: the first pull replays the already-arrived value
    // off the inherited connection — the transition doesn't hold
    const it = lq(7)[Symbol.asyncIterator]();
    expect((await it.next()).value).toBe("warm");
    expect(producer.invocations).toBe(1); // no second connection
    await it.return!();
  });

  test("without preload intent, calling still opens nothing", async () => {
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    lq(7);
    await tick();
    expect(producer.invocations).toBe(0);
  });

  test("a 5xx-stamped death stays transient and reconnects", async () => {
    let invocations = 0;
    const lq = liveQuery(async function* () {
      invocations++;
      if (invocations === 1) {
        yield "v1";
        throw Object.assign(new Error("upstream hiccup"), { status: 503 });
      }
      yield "v2";
    }, uniqueName());
    const a = lq()[Symbol.asyncIterator]();
    expect((await a.next()).value).toBe("v1");
    expect((await a.next()).value).toBe("v2");
    expect(invocations).toBe(2);
  }, 10000);
});

describe("liveQuery through solid's reactive consumption", () => {
  test("a memo consumes the channel: successive yields become memo values", async () => {
    const { createMemo, createRoot, createSignal: solidSignal, flush } = await import("solid-js");
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    await createRoot(async dispose => {
      const messages = createMemo(() => lq("room") as any);
      flush();
      await tick();
      producer.push(["hi"]);
      await tick();
      flush();
      expect(messages()).toEqual(["hi"]);
      producer.push(["hi", "there"]);
      await tick();
      flush();
      expect(messages()).toEqual(["hi", "there"]);
      expect(producer.invocations).toBe(1);
      dispose();
    });
    await tick();
    expect(producer.open).toBe(0); // disposal released the channel
  });

  test("two memos share one connection; key switch moves channels", async () => {
    const { createMemo, createRoot, createSignal: solidSignal, flush } = await import("solid-js");
    const producer = makeProducer();
    const lq = liveQuery(producer.fn, uniqueName());
    await createRoot(async dispose => {
      const [room, setRoom] = solidSignal("a");
      const one = createMemo(() => lq(room()) as any);
      const two = createMemo(() => lq(room()) as any);
      flush();
      await tick();
      expect(producer.invocations).toBe(1); // shared
      producer.push("A");
      await tick();
      flush();
      expect(one()).toBe("A");
      expect(two()).toBe("A");
      setRoom("b");
      flush();
      await tick();
      await tick();
      expect(producer.invocations).toBe(2); // old channel gone, new one opened
      producer.push("B");
      await tick();
      flush();
      expect(one()).toBe("B");
      expect(two()).toBe("B");
      dispose();
    });
  });
});
