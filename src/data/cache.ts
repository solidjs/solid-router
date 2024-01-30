import {
  createSignal,
  getListener,
  getOwner,
  onCleanup,
  sharedConfig,
  type Signal,
  startTransition
} from "solid-js";
import { createStore, reconcile, type ReconcileOptions } from "solid-js/store";
import { getRequestEvent, isServer } from "solid-js/web";
import { useNavigate, getIntent } from "../routing";
import { redirectStatusCodes } from "../utils";
import { Intent } from "../types";

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;
type CacheEntry = [number, any, Intent | undefined, Signal<number> & { count: number }];
let cacheMap = new Map<string, CacheEntry>();

// cleanup forward/back cache
if (!isServer) {
  setInterval(() => {
    const now = Date.now();
    for (let [k, v] of cacheMap.entries()) {
      if (!v[3].count && now - v[0] > CACHE_TIMEOUT) {
        cacheMap.delete(k);
      }
    }
  }, 300000);
}

function getCache() {
  if (!isServer) return cacheMap;
  const req = getRequestEvent() || sharedConfig.context!;
  if (!req) throw new Error("Cannot find cache context");
  return (req as any).routerCache || ((req as any).routerCache = new Map());
}

export function revalidate(key?: string | string[] | void, force = true) {
  return startTransition(() => {
    const now = Date.now();
    cacheKeyOp(key, entry => {
      force && (entry[0] = 0); //force cache miss
      entry[3][1](now); // retrigger live signals
    });
  });
}

export function cacheKeyOp(key: string | string[] | void, fn: (cacheEntry: CacheEntry) => void) {
  key && !Array.isArray(key) && (key = [key]);
  for (let k of cacheMap.keys()) {
    if (key === undefined || matchKey(k, key as string[])) fn(cacheMap.get(k)!);
  }
}

export type CachedFunction<T extends (...args: any) => U | Response, U> = T & {
  keyFor: (...args: Parameters<T>) => string;
  key: string;
};

export function cache<T extends (...args: any) => U | Response, U>(
  fn: T,
  name: string,
  options?: ReconcileOptions
): CachedFunction<T, U> {
  const [store, setStore] = createStore<Record<string, any>>({});
  // prioritize GET for server functions
  if ((fn as any).GET) fn = (fn as any).GET;
  const cachedFn = ((...args: Parameters<T>) => {
    const cache = getCache();
    const intent = getIntent();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
    const now = Date.now();
    const key = name + hashKey(args);
    let cached = cache.get(key) as CacheEntry;
    let tracking;
    if (getListener() && !isServer) {
      tracking = true;
      onCleanup(() => cached[3].count--);
    }

    if (
      cached &&
      (isServer ||
        intent === "native" ||
        (cache[0] && cache[3].size) ||
        Date.now() - cached[0] < PRELOAD_TIMEOUT)
    ) {
      if (tracking) {
        cached[3].count++;
        cached[3][0](); // track
      }
      if (cached[2] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (intent !== "preload") {
        res =
          "then" in (cached[1] as Promise<U>)
            ? (cached[1] as Promise<U>).then(handleResponse(false), handleResponse(true))
            : handleResponse(false)(cached[1]);
        !isServer && intent === "navigate" && startTransition(() => cached[3][1](cached[0])); // update version
      }
      return res;
    }
    let res =
      !isServer && sharedConfig.context && sharedConfig.load
        ? sharedConfig.load(key) // hydrating
        : fn(...(args as any));

    // serialize on server
    if (isServer && sharedConfig.context && !(sharedConfig.context as any).noHydrate) {
      const e = getRequestEvent();
      (!e || !e.serverOnly) && (sharedConfig.context as any).serialize(key, res);
    }

    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[2] = intent;
      !isServer && intent === "navigate" && startTransition(() => cached[3][1](cached[0])); // update version
    } else {
      cache.set(
        key,
        (cached = [now, res, intent, createSignal(now) as Signal<number> & { count: number }])
      );
      cached[3].count = 0;
    }
    if (tracking) {
      cached[3].count++;
      cached[3][0](); // track
    }
    if (intent !== "preload") {
      res =
        "then" in (res as Promise<U>)
          ? (res as Promise<U>).then(handleResponse(false), handleResponse(true))
          : handleResponse(false)(res);
    }
    return res;

    function handleResponse(error: boolean) {
      return async (v: U | Response) => {
        if (v instanceof Response) {
          if (redirectStatusCodes.has(v.status)) {
            if (navigate) {
              startTransition(() => {
                let url = (v as Response).headers.get(LocationHeader);
                if (url && url.startsWith("/")) {
                  navigate!(url, {
                    replace: true
                  });
                } else if (!isServer && url) {
                  window.location.href = url;
                }
              });
            }
            return;
          }
          if ((v as any).customBody) v = await (v as any).customBody();
        }
        if (error) throw v;
        if (isServer) return v;
        setStore(key, reconcile(v, options));
        return store[key];
      };
    }
  }) as CachedFunction<T, U>;
  cachedFn.keyFor = (...args: Parameters<T>) => name + hashKey(args);
  cachedFn.key = name;
  return cachedFn;
}

cache.set = (key: string, value: any) => {
  const cache = getCache();
  const now = Date.now();
  let cached = cache.get(key);
  if (cached) {
    cached[0] = now;
    cached[1] = value;
    cached[2] = "preload";
  } else {
    cache.set(
      key,
      (cached = [now, value, , createSignal(now) as Signal<number> & { count: number }])
    );
    cached[3].count = 0;
  }
};

cache.clear = () => getCache().clear();

function matchKey(key: string, keys: string[]) {
  for (let k of keys) {
    if (key.startsWith(k)) return true;
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
