import { createSignal, type Signal } from "solid-js";
import {
  getRequestEvent,
  getServerFunctionMetadata,
  getServerFunctionRPC,
  isServer,
  isServerFunction
} from "@solidjs/web";
import {
  hashKey,
  matchKey,
  registerFlightDataHook,
  registerRevalidateHook
} from "./query.js";

// The live-source brand (registered symbol — no transport import needed):
// computations meeting a branded iterable apply live SSR policy (document
// face takes the first value; hydration re-runs the compute after adoption
// to reconnect). liveQuery writes it on both faces itself — the server-side
// resolved iterable and the client-side multicast iterable — so a producer
// needs no separate live() declaration to be live here.
const LIVE_SOURCE = Symbol.for("solid.LiveSource");

export type LiveQueryStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

type Channel = {
  key: string;
  /** the keyed store this channel lives in (module map or a request's map) */
  map: Map<string, Channel>;
  /** live consumer iterators */
  count: number;
  /** bumps once per delivered value — consumers diff against it */
  version: number;
  latest: any;
  /** sticky terminal failure — consumers rethrow (transient deaths retry) */
  error: any;
  done: boolean;
  waiters: Set<() => void>;
  /** reconnect generation — a superseded pump's late values are dropped */
  gen: number;
  /** ends the current underlying iterator (transport return() aborts the call) */
  close: () => void;
  /** the producer, held for reconnect */
  call: () => any;
  /** report wire state to the keyed status signal (client channels only) */
  report: boolean;
  /** keep the record (latest value) past teardown — request-scoped channels
   * replay it to later consumers of the same render for value consistency */
  retain: boolean;
};

const channelMap = new Map<string, Channel>();
// Status outlives the channel (an "idle"/"closed" read after teardown is
// meaningful), so signals live in their own keyed map.
const statusMap = new Map<string, Signal<LiveQueryStatus>>();

function statusSignal(key: string) {
  let s = statusMap.get(key);
  // ownedWrite: the first write happens synchronously inside whatever
  // computation pulled the channel open — this is channel-owned state, not
  // the computation's own.
  if (!s) statusMap.set(key, (s = createSignal<LiveQueryStatus>("idle", { ownedWrite: true })));
  return s;
}

function wake(ch: Channel) {
  const waiters = [...ch.waiters];
  ch.waiters.clear();
  for (const w of waiters) w();
}

const noStatus = () => {};

async function connect(ch: Channel) {
  const gen = ch.gen;
  const setStatus = ch.report ? statusSignal(ch.key)[1] : noStatus;
  let attempts = 0;
  setStatus(ch.version ? "reconnecting" : "connecting");
  while (true) {
    try {
      const result = await ch.call();
      if (gen !== ch.gen || ch.done) {
        // superseded (reconnect) or torn down while connecting: the arrived
        // stream must still be ended or its request leaks
        result?.[Symbol.asyncIterator] && result[Symbol.asyncIterator]().return?.();
        return;
      }
      // A live()-declared producer's own retry loop erases deaths from the
      // value stream and reports them through onstatus — forward those into
      // the channel's status so both producer kinds read the same. Its
      // "closed" is redundant with our own done handling below.
      if (result !== null && typeof result === "object") {
        try {
          result.onstatus = (state: string) => {
            if (gen === ch.gen && state !== "closed") setStatus(state as LiveQueryStatus);
          };
        } catch {}
      }
      const it =
        result !== null && typeof result === "object" && result[Symbol.asyncIterator]
          ? result[Symbol.asyncIterator]()
          : (async function* () {
              yield result;
            })();
      ch.close = () => {
        try {
          const r = it.return && it.return();
          if (r && typeof (r as any).then === "function") (r as any).then(undefined, () => {});
        } catch {}
      };
      while (true) {
        const r = await it.next();
        if (gen !== ch.gen || ch.done) return;
        if (r.done) break;
        ch.latest = r.value;
        ch.version++;
        attempts = 0; // healthy value: backoff resets
        setStatus("connected");
        wake(ch);
      }
      ch.done = true;
      setStatus("closed");
      wake(ch);
      return;
    } catch (error) {
      if (gen !== ch.gen || ch.done) return;
      const status = (error as any)?.status;
      if (!ch.version || (typeof status === "number" && status >= 400 && status < 500)) {
        // Terminal: never connected (fail like a normal call), or a
        // definite rejection — the transport stamps HTTP statuses onto
        // failures, and a 4xx means the server understood and refused;
        // retrying cannot change the answer. Consumers rethrow (after
        // draining the latest value), surfacing to error boundaries.
        ch.error = error;
        ch.done = true;
        setStatus("closed");
        wake(ch);
        return;
      }
      // A stream that had delivered died transiently (network, 5xx,
      // severed stream): the channel IS the live layer — reconnect with
      // backoff, latest value keeps serving meanwhile. (A live()-declared
      // producer never reaches here; its transport retries.)
      setStatus("reconnecting");
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, Math.min(500 * 2 ** attempts++, 10000));
        // connectivity returning wakes the sleep early
        if (typeof addEventListener === "function")
          addEventListener("online", () => (clearTimeout(timer), resolve()), { once: true });
      });
      if (gen !== ch.gen || ch.done) return;
    }
  }
}

function teardown(ch: Channel) {
  // Deferred so a same-key resubscribe in the same tick (a memo re-running
  // its compute) reuses the connection instead of thrashing it.
  queueMicrotask(() => {
    if (ch.count > 0 || ch.map.get(ch.key) !== ch) return;
    const ended = ch.done; // completed/failed on its own — "closed" persists
    ch.done = true;
    ch.close();
    wake(ch);
    if (ch.retain) return; // request-scoped: latest stays replayable
    ch.map.delete(ch.key);
    if (ch.report && !ended) statusSignal(ch.key)[1]("idle");
  });
}

function openChannel(
  map: Map<string, Channel>,
  key: string,
  call: () => any,
  report: boolean,
  retain: boolean
): Channel {
  let ch = map.get(key);
  if (!ch) {
    ch = {
      key,
      map,
      count: 0,
      version: 0,
      latest: undefined,
      error: undefined,
      done: false,
      waiters: new Set(),
      gen: 0,
      close: () => {},
      call,
      report,
      retain
    };
    map.set(key, ch);
    connect(ch);
  }
  return ch;
}

// The consumer half: a branded iterable whose iterators subscribe to the
// channel lazily (first pull connects — a hydration trace or speculative
// call opens nothing), replay the latest value immediately, then follow
// with latest-wins delivery.
function subscriberIterable(open: () => Channel) {
  return {
    [LIVE_SOURCE]: true,
    [Symbol.asyncIterator]() {
      const ch = open();
      ch.count++;
      let seen = 0;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (--ch.count === 0) teardown(ch);
      };
      const pull = async (): Promise<IteratorResult<any>> => {
        while (true) {
          if (ch.error && seen >= ch.version) {
            release();
            throw ch.error;
          }
          if (ch.version > seen) {
            seen = ch.version;
            return { done: false, value: ch.latest };
          }
          if (ch.done) {
            release();
            return { done: true, value: undefined };
          }
          await new Promise<void>(resolve => ch.waiters.add(resolve));
        }
      };
      return {
        next: () => (released ? Promise.resolve({ done: true as const, value: undefined }) : pull()),
        return(value?: any) {
          release();
          return Promise.resolve({ done: true as const, value });
        }
      };
    }
  };
}

function reconnectChannel(ch: Channel) {
  ch.gen++;
  ch.close();
  ch.error = undefined;
  ch.done = false;
  connect(ch);
}

function push(ch: Channel, value: any) {
  ch.latest = value;
  ch.version++;
  wake(ch);
}

// Live channels participate in both data protocols. Registered on first
// liveQuery() call, not at module scope: a side-effectful top level would
// anchor this module into graphs that never use it.
//
// - Explicit revalidate(key) (force) reconnects — the producer re-yields
//   current state on invocation by contract.
// - The post-mutation sweep (force=false) does NOT reconnect: the
//   connection is alive and is itself the freshness mechanism — a
//   push-driven producer yields the mutated state on its own, and tearing
//   down healthy connections on every mutation defeats the model.
// - Single-flight payloads deliver INTO open channels, exactly as they seed
//   the query cache: the mutation response is the round trip, the channel
//   adopts the value immediately, and the live stream stays authoritative
//   for everything after.
let hooked = false;
function hookRevalidate() {
  if (hooked) return;
  hooked = true;
  registerRevalidateHook((keys, force) => {
    if (!force) return;
    for (const [k, ch] of channelMap) {
      if (keys === undefined || matchKey(k, keys)) reconnectChannel(ch);
    }
  });
  registerFlightDataHook(data => {
    for (const k in data) {
      const ch = channelMap.get(k);
      if (!ch || ch.done) continue;
      const v = data[k];
      if (v !== null && typeof v === "object" && v[Symbol.asyncIterator]) {
        // a live key collected server-side arrives stream-shaped: adopt
        // its yields for as long as it runs (it ends with the response
        // body); the channel's own connection remains authoritative
        (async () => {
          try {
            for await (const value of v) {
              if (ch.done) return;
              push(ch, value);
            }
          } catch {}
        })();
      } else push(ch, v);
    }
  });
}

export type LiveFunction<T extends (...args: any) => any> = T extends (
  ...args: infer A
) => infer R
  ? ((...args: A) => AsyncIterable<Awaited<R> extends AsyncIterable<infer V> ? V : Awaited<R>>) & {
      keyFor: (...args: A) => string;
      key: string;
      status: (...args: A) => LiveQueryStatus;
    }
  : never;

/**
 * Declares a keyed live query over a value-shaped stream: an async-iterable
 * producer whose yields are successive VALUES of one logical query, with the
 * contract that the producer re-yields current state on every invocation.
 * liveQuery IS the live layer — no separate declaration needed:
 *
 * - One connection per (name + args) key, shared by every consumer. Late
 *   subscribers receive the latest value immediately, delivery is
 *   latest-wins, and the connection closes when the last consumer leaves.
 * - A connected stream that dies transiently (network, 5xx) reconnects with
 *   exponential backoff — the latest value keeps serving meanwhile. A
 *   definite rejection (4xx: the transport stamps HTTP statuses onto
 *   failures) ends the channel and surfaces the error to consumers, as does
 *   a first-connect failure.
 * - Server functions are declared GET at creation (like `query`). Live
 *   queries participate in single-flight on the delivery side: a mutation's
 *   flight payload pushes straight into open channels (the mutation
 *   response is the round trip), while the post-mutation sweep leaves the
 *   healthy connection in place — the live stream stays authoritative.
 * - SSR: the document face renders the first value; hydration adopts it and
 *   reconnects. Channels are request-scoped on the server, so every
 *   consumer of a key in one render observes the same value. Explicit
 *   `revalidate(key)` reconnects (the producer re-yields current state on
 *   invocation), and `status(...args)` is a reactive read of the channel's
 *   wire state.
 *
 * ```ts
 * const roomMessages = liveQuery(getMessages, "messages");
 * // in a component — one connection, however many consumers:
 * const messages = createMemo(() => roomMessages(props.room));
 * ```
 */
export function liveQuery<T extends (...args: any) => any>(fn: T, name: string): LiveFunction<T> {
  hookRevalidate();
  // liveQuery implies GET, exactly as query does: reads belong on the GET
  // transport (cacheable URLs, no single-flight enveloping). An explicit
  // GET(fn) or live(GET(fn)) declaration passes through untouched.
  if (isServerFunction(fn) && !getServerFunctionMetadata(fn)?.method) {
    const rpc = getServerFunctionRPC();
    if (rpc) fn = rpc.GET(fn) as unknown as T;
  }
  const liveFn = ((...args: Parameters<T>) => {
    const key = name + hashKey(args);
    if (isServer) {
      const e = getRequestEvent();
      if (!e) {
        // No request scope (static render, tests): hand the source through
        // whole, branded, so the signals layer applies live SSR policy
        // (first value, then client takeover).
        const result = fn(...(args as any));
        const brand = (r: any) => {
          if (r !== null && typeof r === "object" && r[Symbol.asyncIterator]) r[LIVE_SOURCE] = true;
          return r;
        };
        return result !== null && typeof result === "object" && typeof result.then === "function"
          ? result.then(brand)
          : brand(result);
      }
      // Request-scoped channels: two consumers of one key during one render
      // must observe the SAME first value (query's request cache gives its
      // reads the same guarantee). Channels live in the event, retained
      // past teardown so a later consumer replays the settled value instead
      // of reinvoking; the producer still closes with its last consumer.
      const router = ((e as any).router || ((e as any).router = {}));
      const channels: Map<string, Channel> =
        router.liveChannels || (router.liveChannels = new Map());
      return subscriberIterable(() =>
        openChannel(channels, key, () => fn(...(args as any)), false, true)
      );
    }
    return subscriberIterable(() =>
      openChannel(channelMap, key, () => fn(...(args as any)), true, false)
    );
  }) as unknown as LiveFunction<T>;
  liveFn.keyFor = (...args: Parameters<T>) => name + hashKey(args);
  liveFn.key = name;
  liveFn.status = (...args: Parameters<T>) => statusSignal(name + hashKey(args))[0]();
  return liveFn;
}

