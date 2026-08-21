import {
  createSignal,
  getObserver,
  getOwner,
  onCleanup,
  sharedConfig,
  type Signal
} from "solid-js";
// Everything server-function-shaped comes off the CORE entry: detection
// (isServerFunction/getServerFunctionMetadata, registered-symbol reads) and
// the late-bound RPC seam (getServerFunctionRPC). The server-functions
// entry itself — the fetch transport + the seroval codec behind it — is
// deliberately NOT imported here: query() is in every router app's eager
// graph, and a static import made every zero-server-function app ship
// ~9 KB gz of codec it could never invoke. The transport registers itself
// into the seam when a `'use server'` reference is created (compiled
// output, module scope), so by the time a server function can reach
// query() the seam is filled; plain-fetch apps read undefined forever.
import {
  getRequestEvent,
  getServerFunctionMetadata,
  getServerFunctionRPC,
  isResponseEnvelope,
  isServer,
  isServerFunction,
  REVALIDATE_HEADER
} from "@solidjs/web";
import { useRouter, getIntent, getInPreloadFn } from "../routing.js";
import type { CacheEntry, NarrowResponse } from "../types.js";

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;
// When this client booted. Flight-registry entries (sharedConfig.has/load)
// hold values the server computed while rendering THIS page, so their age is
// anchored here — not at whenever a late query() call happens to consume one.
const bootTime = Date.now();
let cacheMap = new Map<string, CacheEntry>();

// cleanup forward/back cache
if (!isServer) {
  setInterval(() => {
    const now = Date.now();
    for (let [k, v] of cacheMap.entries()) {
      if (!v[4].count && now - v[0] > CACHE_TIMEOUT) {
        cacheMap.delete(k);
      }
    }
  }, 300000);
}

function getCache() {
  if (!isServer) return cacheMap;
  const req = getRequestEvent();
  if (!req) throw new Error("Cannot find cache context");
  return (req.router || (req.router = {})).cache || (req.router.cache = new Map());
}

// Other keyed stores participating in the data protocols (live query
// channels) register here — revalidate() stays the one invalidation verb,
// and single-flight payloads reach every keyed store, not just the cache.
const revalidateHooks: ((keys: string[] | void, force: boolean) => void)[] = [];
export function registerRevalidateHook(hook: (keys: string[] | void, force: boolean) => void) {
  revalidateHooks.push(hook);
}
const flightHooks: ((data: Record<string, any>) => void)[] = [];
export function registerFlightDataHook(hook: (data: Record<string, any>) => void) {
  flightHooks.push(hook);
}
/** Fans a single-flight payload out to registered keyed stores (the query
 * cache itself is seeded by the caller via query.set). */
export function deliverFlightData(data: Record<string, any>) {
  for (const hook of flightHooks) hook(data);
}

/**
 * Revalidates the given cache entry/entries.
 */
export function revalidate(key?: string | string[] | void, force = true) {
  const now = Date.now();
  cacheKeyOp(key, entry => {
    force && (entry[0] = 0); //force cache miss
    entry[4][1](now); // retrigger live signals
  });
  const keys = key === undefined ? undefined : Array.isArray(key) ? key : [key];
  for (const hook of revalidateHooks) hook(keys, force);
}

export function cacheKeyOp(key: string | string[] | void, fn: (cacheEntry: CacheEntry) => void) {
  key && !Array.isArray(key) && (key = [key]);
  for (let k of cacheMap.keys()) {
    if (key === undefined || matchKey(k, key as string[])) fn(cacheMap.get(k)!);
  }
}

export type CachedFunction<T extends (...args: any) => any> = T extends (
  ...args: infer A
) => infer R
  ? ([] extends { [K in keyof A]-?: A[K] } // A tuple full of optional values is equivalent to an empty tuple
    ? (
      ...args: never[]
    ) => R extends Promise<infer P> ? Promise<NarrowResponse<P>> : NarrowResponse<R>
    : (
      ...args: A
    ) => R extends Promise<infer P> ? Promise<NarrowResponse<P>> : NarrowResponse<R>) & {
      keyFor: (...args: A) => string;
      key: string;
    }
  : never;

export function query<T extends (...args: any) => any>(fn: T, name: string): CachedFunction<T> {
  // query implies GET: the router primitive is the declaration site, so a
  // server function handed to query() is wrapped with core `GET(fn)` here,
  // at query-creation (module scope) — the server half records the method
  // declaration for dispatch, the client half swaps in the GET transport.
  // An explicit `GET(fn)` already carries the declaration on the metadata
  // channel (`getServerFunctionMetadata(fn)?.method === "GET"`) and passes
  // through; non-server functions are untouched. `GET` comes through the
  // late-bound RPC seam: a reference in the graph guarantees the transport
  // registered it (references are created at module scope, ahead of the
  // module handing one to query()), so the read only misses for hand-built
  // brands that never saw the runtime — which have no transport to declare
  // on either.
  if (isServerFunction(fn) && !getServerFunctionMetadata(fn)?.method) {
    const rpc = getServerFunctionRPC();
    if (rpc) fn = rpc.GET(fn) as unknown as T;
  }
  const cachedFn = ((...args: Parameters<T>) => {
    const cache = getCache();
    const intent = getIntent();
    const inPreloadFn = getInPreloadFn();
    const owner = getOwner();
    const router = owner ? useRouter() : undefined;
    const navigate = router && router.navigatorFactory();
    const now = Date.now();
    const key = name + hashKey(args);
    let cached = cache.get(key) as CacheEntry;
    let tracking;
    if (isServer) {
      const e = getRequestEvent();
      if (e) {
        const dataOnly = (e.router || (e.router = {})).dataOnly;
        if (dataOnly) {
          const data = e && (e.router.data || (e.router.data = {}));
          if (data && key in data) return data[key];
          if (Array.isArray(dataOnly) && !matchKey(key, dataOnly)) {
            data[key] = undefined;
            return Promise.resolve();
          }
        }
      }
    }
    if (getObserver() && !isServer) {
      tracking = true;
      onCleanup(() => cached[4].count--);
    }

    if (
      cached &&
      cached[0] &&
      (isServer ||
        intent === "native" ||
        cached[4].count ||
        Date.now() - cached[0] < PRELOAD_TIMEOUT)
    ) {
      if (tracking) {
        cached[4].count++;
        cached[4][0](); // track
      }
      if (cached[3] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (intent !== "preload") {
        res =
          "then" in cached[1]
            ? cached[1].then(handleResponse(false), handleResponse(true))
            : handleResponse(false)(cached[1]);
        !isServer && intent === "navigate" && cached[4][1](cached[0]); // update version
      }
      inPreloadFn && "then" in res && res.catch(() => { });
      return res;
    }
    let res;
    let adopted = false;
    // Flight entries stay consumable past hydration `done` on purpose — a
    // boundary inside a deferred claim scope (a lazy route module) can
    // legitimately make its first query() call after global hydration reads
    // as done, and must adopt the promise the server DOM was rendered from
    // (#2964). Adoption slots into the cache's own freshness model as a
    // fetch that happened at boot: outside a navigation (no intent — the
    // hydration/claim case) DOM consistency wins at any age; a back/forward
    // restore honors the payload within the cache's retention window, the
    // same bar the sweep applies to entries the router fetched itself; an
    // active navigation (or its preload) accepts the payload only while a
    // real preload of the same age would still satisfy it — anything older
    // refetches instead of serving a minutes-old value on a fresh navigation.
    if (!isServer && sharedConfig.has && sharedConfig.has(key)) {
      const payloadAge = now - bootTime;
      if (!intent || payloadAge < (intent === "native" ? CACHE_TIMEOUT : PRELOAD_TIMEOUT)) {
        adopted = true;
        res = sharedConfig.load!(key); // hydrating
        // @ts-ignore at least until we add a delete method to sharedConfig
        delete globalThis._$HY.r[key];
      }
      // A payload too old for this intent stays in the registry: it is
      // inert while the refetched entry below lives, but a later claim
      // read (no intent) may still need it for server-DOM consistency.
    }
    if (!adopted) res = fn(...(args as any));

    // Adopted entries are stamped at boot — when their data was actually
    // fetched — not at consumption. The hydration render burst still dedups
    // through the normal window/count reuse above (it happens within
    // milliseconds of boot), while a navigation that comes along later sees
    // the payload's true age and refetches past PRELOAD_TIMEOUT, exactly as
    // it would for a preload performed when the server fetched the data.
    const stamp = adopted ? bootTime : now;
    if (cached) {
      cached[0] = stamp;
      cached[1] = res;
      cached[3] = intent;
      !isServer && intent === "navigate" && cached[4][1](cached[0]); // update version
    } else {
      cache.set(
        key,
        (cached = [stamp, res, , intent, createSignal(stamp, { ownedWrite: true }) as Signal<number> & { count: number }])
      );
      cached[4].count = 0;
    }
    if (tracking) {
      cached[4].count++;
      cached[4][0](); // track
    }
    if (isServer) {
      const e = getRequestEvent();
      if (e && e.router!.dataOnly) return (e.router!.data![key] = res);
    }
    if (intent !== "preload") {
      res =
        "then" in res
          ? res.then(handleResponse(false), handleResponse(true))
          : handleResponse(false)(res);
    }
    inPreloadFn && "then" in res && res.catch(() => { });
    // serialize on server
    if (
      isServer &&
      (sharedConfig as any).context &&
      (sharedConfig as any).context.async &&
      !(sharedConfig as any).context.noHydrate
    ) {
      const e = getRequestEvent();
      (!e || !e.serverOnly) && (sharedConfig as any).context.serialize(key, res);
    }
    return res;

    function handleResponse(error: boolean) {
      return async (v: any) => {
        let enveloped: any;
        let hasEnveloped = false;
        if (isResponseEnvelope(v)) {
          // respond(): the value rides in memory beside the metadata
          enveloped = v.value;
          hasEnveloped = true;
          v = v.response;
        }
        if (v instanceof Response) {
          const e = getRequestEvent();

          if (e) {
            for (const [key, value] of v.headers) {
              if (key == "set-cookie")
                e.response.headers.append("set-cookie", value);
              else
                e.response.headers.set(key, value);
            }
          }

          const url = v.headers.get(LocationHeader);

          if (url !== null) {
            // invalidate the redirect's revalidation keys before navigating so
            // the destination's preloads see the miss and fetch fresh (#580 thread)
            const keys = !isServer && v.headers.get(REVALIDATE_HEADER)?.split(",");
            keys && cacheKeyOp(keys, entry => (entry[0] = 0));

            // client + server relative redirect
            const soft = navigate && url.startsWith("/");
            if (soft) navigate!(url, { replace: true });
            else if (!isServer) window.location.href = url;
            else if (e) e.response.status = 302;

            // sweep the live signals inside the same transition as the
            // navigation: surviving consumers (shared layouts) refetch and
            // hold the commit, so the destination never paints stale data
            keys && revalidate(keys, false);

            // Hold the read pending on the client: the navigation unmounts this
            // consumer, and resolving `undefined` instead hands a missing value
            // to whatever renders before the transition commits (a downstream
            // `.map()` crashes). The server keeps resolving — its render can't
            // await a navigation and the 302 discards the body anyway.
            return isServer ? undefined : new Promise(() => {});
          }

          if (hasEnveloped) v = enveloped;
          else if (v.body) {
            // responses the transport hands over whole (revalidation) carry a
            // codec-encoded body; anything else (a raw user Response) stays
            // whole. The decoder rides the late-bound RPC seam: only a graph
            // with server functions has codec-encoded responses to decode,
            // and only such a graph has the codec registered — a plain-fetch
            // query's raw Response passes through identically either way.
            const rpc = getServerFunctionRPC();
            if (rpc) {
              const decoded = await rpc.decodeResponse(v);
              if (decoded !== undefined) v = decoded;
            }
          }
        }
        if (error) throw v;
        cached[2] = v;
        return v;
      };
    }
  }) as unknown as CachedFunction<T>;
  cachedFn.keyFor = (...args: Parameters<T>) => name + hashKey(args);
  cachedFn.key = name;
  return cachedFn;
}

query.get = (key: string) => {
  const cached = getCache().get(key) as CacheEntry;
  return cached[2];
}

query.set = <T>(key: string, value: T extends Promise<any> ? never : T) => {
  const cache = getCache();
  const now = Date.now();
  let cached = cache.get(key);
  if (cached) {
    cached[0] = now;
    cached[1] = Promise.resolve(value);
    cached[2] = value;
    cached[3] = "preload";
  } else {
    cache.set(
      key,
      (cached = [now, Promise.resolve(value), value, "preload", createSignal(now, { ownedWrite: true }) as Signal<number> & { count: number }])
    );
    cached[4].count = 0;
  }
};

query.delete = (key: string) => getCache().delete(key);

query.clear = () => getCache().clear();

export function matchKey(key: string, keys: string[]) {
  for (let k of keys) {
    if (k && key.startsWith(k)) return true;
  }
  return false;
}

// Modified from the amazing Tanstack Query library (MIT)
// https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L168
export function hashKey<T extends Array<any>>(args: T): string {
  return JSON.stringify(args, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
        .sort()
        .reduce((result, key) => {
          result[key] = val[key];
          return result;
        }, {} as any)
      : val
  );
}

function isPlainObject(obj: object) {
  let proto;
  return (
    obj != null &&
    typeof obj === "object" &&
    (!(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype)
  );
}
