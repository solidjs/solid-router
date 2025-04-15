import {
  createSignal,
  getListener,
  getOwner,
  onCleanup,
  sharedConfig,
  type Signal,
  startTransition
} from "solid-js";
import { getRequestEvent, isServer } from "solid-js/web";
import { useNavigate, getIntent, getInPreloadFn } from "../routing.js";
import type { CacheEntry, NarrowResponse } from "../types.js";

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;
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

/**
 * Revalidates the given cache entry/entries.
 */
export function revalidate(key?: string | string[] | void, force = true) {
  return startTransition(() => {
    const now = Date.now();
    cacheKeyOp(key, entry => {
      force && (entry[0] = 0); //force cache miss
      entry[4][1](now); // retrigger live signals
    });
  });
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
  // prioritize GET for server functions
  if ((fn as any).GET) fn = (fn as any).GET;
  const cachedFn = ((...args: Parameters<T>) => {
    const cache = getCache();
    const intent = getIntent();
    const inPreloadFn = getInPreloadFn();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
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
    if (getListener() && !isServer) {
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
        !isServer && intent === "navigate" && startTransition(() => cached[4][1](cached[0])); // update version
      }
      inPreloadFn && "then" in res && res.catch(() => {});
      return res;
    }
    let res;
    if (!isServer && sharedConfig.has && sharedConfig.has(key)) {
      res = sharedConfig.load!(key) // hydrating
      // @ts-ignore at least until we add a delete method to sharedConfig
      delete globalThis._$HY.r[key];
    } else res = fn(...(args as any));

    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[3] = intent;
      !isServer && intent === "navigate" && startTransition(() => cached[4][1](cached[0])); // update version
    } else {
      cache.set(
        key,
        (cached = [now, res, , intent, createSignal(now) as Signal<number> & { count: number }])
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
    inPreloadFn && "then" in res && res.catch(() => {});
    // serialize on server
    if (
      isServer &&
      sharedConfig.context &&
      (sharedConfig.context as any).async &&
      !(sharedConfig.context as any).noHydrate
    ) {
      const e = getRequestEvent();
      (!e || !e.serverOnly) && (sharedConfig.context as any).serialize(key, res);
    }
    return res;

    function handleResponse(error: boolean) {
      return async (v: any | Response) => {
        if (v instanceof Response) {
          const e = getRequestEvent();
          
          if (e) {
            for (const [ key, value ] of v.headers) {
              if (key == "set-cookie")
                e.response.headers.append("set-cookie", value);
              else
                e.response.headers.set(key, value);
            }
          }
          
          const url = v.headers.get(LocationHeader);

          if (url !== null) {
            // client + server relative redirect
            if (navigate && url.startsWith("/"))
              startTransition(() => {
                navigate(url, { replace: true });
              });
            else if (!isServer) window.location.href = url;
            else if (e) e.response.status = 302;

            return;
          }

          if ((v as any).customBody) v = await (v as any).customBody();
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
      (cached = [now, Promise.resolve(value), value, "preload", createSignal(now) as Signal<number> & { count: number }])
    );
    cached[4].count = 0;
  }
};

query.delete = (key: string) => getCache().delete(key);

query.clear = () => getCache().clear();

/** @deprecated use query instead */
export const cache = query;

function matchKey(key: string, keys: string[]) {
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
