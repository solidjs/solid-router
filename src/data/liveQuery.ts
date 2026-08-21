// standalone import: `DEV` is undefined in solid's production build, so app
// bundlers fold `DEV &&` diagnostics out of shipped bundles
import { DEV, createSignal, type Signal } from "solid-js";
import { getServerFunctionMetadata, isServer, isServerFunction } from "@solidjs/web";
import { hashKey, matchKey, registerRevalidateHook } from "./query.js";

// The transport brand (registered symbol — no import needed): computations
// meeting a branded iterable apply live SSR policy (document face takes the
// first value; hydration re-runs the compute after adoption to reconnect).
// The multicast iterable carries it so a channel consumer gets the same
// treatment a raw live() call would.
const LIVE_SOURCE = Symbol.for("solid.LiveSource");

export type LiveQueryStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

type Channel = {
  key: string;
  /** live consumer iterators */
  count: number;
  /** bumps once per delivered value — consumers diff against it */
  version: number;
  latest: any;
  /** sticky failure: non-live sources have no retry story, consumers rethrow */
  error: any;
  done: boolean;
  waiters: Set<() => void>;
  /** reconnect generation — a superseded pump's late values are dropped */
  gen: number;
  /** ends the current underlying iterator (transport return() aborts the call) */
  close: () => void;
  /** the producer, held for reconnect */
  call: () => any;
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

async function connect(ch: Channel) {
  const gen = ch.gen;
  const setStatus = statusSignal(ch.key)[1];
  setStatus(ch.version ? "reconnecting" : "connecting");
  try {
    const result = await ch.call();
    if (gen !== ch.gen || ch.done) {
      // superseded (reconnect) or torn down while connecting: the arrived
      // stream must still be ended or its request leaks
      result?.[Symbol.asyncIterator] && result[Symbol.asyncIterator]().return?.();
      return;
    }
    // A live()-declared source reports the wire facts its retry loop erases
    // from the value stream — forward them into the channel's status. Its
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
      setStatus("connected");
      wake(ch);
    }
    ch.done = true;
    setStatus("closed");
    wake(ch);
  } catch (error) {
    if (gen !== ch.gen || ch.done) return;
    // A live() declaration never lets a post-connect death reach here (the
    // transport retries); this is a first-connect failure or a plain
    // source dying — either way the channel has no retry story of its own.
    ch.error = error;
    ch.done = true;
    setStatus("closed");
    wake(ch);
  }
}

function teardown(ch: Channel) {
  // Deferred so a same-key resubscribe in the same tick (a memo re-running
  // its compute) reuses the connection instead of thrashing it.
  queueMicrotask(() => {
    if (ch.count > 0 || channelMap.get(ch.key) !== ch) return;
    channelMap.delete(ch.key);
    ch.done = true;
    ch.close();
    wake(ch);
    statusSignal(ch.key)[1]("idle");
  });
}

function openChannel(key: string, call: () => any): Channel {
  let ch = channelMap.get(key);
  if (!ch) {
    ch = {
      key,
      count: 0,
      version: 0,
      latest: undefined,
      error: undefined,
      done: false,
      waiters: new Set(),
      gen: 0,
      close: () => {},
      call
    };
    channelMap.set(key, ch);
    connect(ch);
  }
  return ch;
}

function reconnectChannel(ch: Channel) {
  ch.gen++;
  ch.close();
  ch.error = undefined;
  ch.done = false;
  connect(ch);
}

// revalidate(key) reaches live channels too: invalidating a live query means
// reconnect — the source re-yields current state on invocation by contract.
// Registered on first liveQuery() call, not at module scope: a side-effectful
// top level would anchor this module into graphs that never use it.
let hooked = false;
function hookRevalidate() {
  if (hooked) return;
  hooked = true;
  registerRevalidateHook(keys => {
    for (const [k, ch] of channelMap) {
      if (keys === undefined || matchKey(k, keys)) reconnectChannel(ch);
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
 * Declares a keyed live query over a value-shaped stream: a channel layer on
 * the `live()` transport. One connection per (name + args) key is shared by
 * every consumer — late subscribers receive the latest value immediately,
 * delivery is latest-wins, and the connection closes when the last consumer
 * leaves. `revalidate(key)` reconnects (the source re-yields current state
 * on invocation), and `status(...args)` is a reactive read of the channel's
 * wire state.
 *
 * The producer should be a `live()`-declared server function (reconnect and
 * SSR policy live in the declaration); any function returning an async
 * iterable works, but a plain source that dies simply closes the channel.
 *
 * ```ts
 * const roomMessages = liveQuery(getMessages, "messages");
 * // in a component — one connection, however many consumers:
 * const messages = createMemo(() => roomMessages(props.room));
 * ```
 */
export function liveQuery<T extends (...args: any) => any>(fn: T, name: string): LiveFunction<T> {
  hookRevalidate();
  if (DEV && isServerFunction(fn) && !getServerFunctionMetadata(fn)?.live) {
    console.warn(
      `liveQuery "${name}": the server function is not live()-declared — ` +
        `without the declaration there is no reconnect-on-death and no SSR ` +
        `live policy. Declare it: liveQuery(live(fn), "${name}").`
    );
  }
  const liveFn = ((...args: Parameters<T>) => {
    const key = name + hashKey(args);
    if (isServer) {
      // The document face is one render: no channels, no multicast — hand
      // the source through whole (branded by the live() declaration) and
      // let the signals layer apply live SSR policy to it.
      return fn(...args);
    }
    // Connection is lazy (first pull), so calling the function is free —
    // a hydration trace or a speculative read opens nothing.
    return {
      [LIVE_SOURCE]: true,
      [Symbol.asyncIterator]() {
        const ch = openChannel(key, () => fn(...args));
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
  }) as unknown as LiveFunction<T>;
  liveFn.keyFor = (...args: Parameters<T>) => name + hashKey(args);
  liveFn.key = name;
  liveFn.status = (...args: Parameters<T>) => statusSignal(name + hashKey(args))[0]();
  return liveFn;
}

/**
 * Pushes a value into a live channel locally: every subscriber sees it as
 * the next delivered value. An optimistic overlay for live data — the next
 * server yield supersedes it. No-op (returns false) when no channel is open.
 */
liveQuery.set = (key: string, value: any) => {
  const ch = channelMap.get(key);
  if (!ch || ch.done) return false;
  ch.latest = value;
  ch.version++;
  wake(ch);
  return true;
};

/** Force-reconnects matching live channels (all when no key is given). */
liveQuery.reconnect = (key?: string | string[]) => {
  const keys = key === undefined ? undefined : Array.isArray(key) ? key : [key];
  for (const [k, ch] of channelMap) {
    if (keys === undefined || matchKey(k, keys)) reconnectChannel(ch);
  }
};
