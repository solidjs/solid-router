import {
  createSignal,
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

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
let cacheMap = new Map<any, any>();

function getCache() {
  if (!isServer) return cacheMap;
  const req = getRequestEvent() || sharedConfig.context!;
  return (req as any).routerCache || ((req as any).routerCache = new Map());
}

export function revalidate(key?: string | any[] | void) {
  return startTransition(() => {
    const now = Date.now();
    for (let k of cacheMap.keys()) {
      if (key === undefined || k === key) {
        const set: Set<Signal<any>> = cacheMap.get(k)[3];
        revalidateSignals(set, now);
        cacheMap.delete(k);
      }
    }
  });
}

function revalidateSignals(set: Set<Signal<any>>, time: number) {
  for (let s of set) s[1](time);
}

export function cache<T extends (...args: any) => U | Response, U>(
  fn: T,
  name: string,
  options?: ReconcileOptions
): T {
  const [store, setStore] = createStore<Record<string, any>>({});
  return ((...args: Parameters<T>) => {
    const cache = getCache();
    const intent = getIntent();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
    const now = Date.now();
    const key = name + (args.length ? ":" + args.join(":") : "");
    let cached = cache.get(key);
    let version: Signal<number>;
    if (owner) {
      version = createSignal(now, {
        equals: (p, v) => v - p < 50 // margin of error
      });
      onCleanup(() => cached[3].delete(version));
      version[0](); // track it;
    }

    if (cached && (isServer || intent === "native" || Date.now() - cached[0] < PRELOAD_TIMEOUT)) {
      version! && cached[3].add(version);
      if (cached[2] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (!isServer && intent === "navigate") {
        res = "then" in (cached[1] as Promise<U>)
          ? (cached[1] as Promise<U>).then(handleResponse(false), handleResponse(true))
          : handleResponse(false)(cached[1]);
        startTransition(() => revalidateSignals(cached[3], cached[0])); // update version
      }
      return res;
    }
    let res =
      !isServer && sharedConfig.context && sharedConfig.load
        ? sharedConfig.load(key) // hydrating
        : fn(...(args as any));

    // serialize on server
    if (isServer && sharedConfig.context && !(sharedConfig.context as any).noHydrate) {
      sharedConfig.context && (sharedConfig.context as any).serialize(key, res);
    }

    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[2] = intent;
      version! && cached[3].add(version);
      if (!isServer && intent === "navigate") {
        startTransition(() => revalidateSignals(cached[3], cached[0])); // update version
      }
    } else cache.set(key, (cached = [now, res, intent, new Set(version! ? [version] : [])]));
    if (intent !== "preload") {
      res = "then" in (res as Promise<U>)
        ? (res as Promise<U>).then(handleResponse(false), handleResponse(true))
        : handleResponse(false)(res);
    }
    return res;

    function handleResponse(error: boolean) {
      return (v: U | Response) => {
        if (v instanceof Response && redirectStatusCodes.has(v.status)) {
          if (navigate) {
            startTransition(() => {
              let url = v.headers.get(LocationHeader);
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
        if (error) throw error;
        if (isServer) return v;
        setStore(key, reconcile(v, options));
        return store[key];
      };
    }
  }) as T;
}
