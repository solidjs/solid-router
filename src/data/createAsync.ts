/**
 * This is mock of the eventual Solid 2.0 primitive. It is not fully featured.
 */
import { type Accessor, createResource, sharedConfig, type Setter, untrack } from "solid-js";
import { createStore, reconcile, type ReconcileOptions, unwrap } from "solid-js/store";
import { isServer } from "solid-js/web";

export function createAsync<T>(
  fn: (prev: T) => Promise<T>,
  options: {
    name?: string;
    initialValue: T;
    deferStream?: boolean;
  }
): Accessor<T>;
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
  }
): Accessor<T | undefined>;
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
  }
): Accessor<T | undefined> {
  let resource: () => T;
  let prev = () =>
    !resource || (resource as any).state === "unresolved" ? undefined : (resource as any).latest;
  [resource] = createResource(
    () => subFetch(fn, untrack(prev)),
    v => v,
    options as any
  );
  return () => resource();
}

export function createAsyncStore<T>(
  fn: (prev: T) => Promise<T>,
  options: {
    name?: string;
    initialValue: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  }
): Accessor<T>;
export function createAsyncStore<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  }
): Accessor<T | undefined>;
export function createAsyncStore<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  } = {}
): Accessor<T | undefined> {
  let resource: () => T;
  let prev = () =>
    !resource || (resource as any).state === "unresolved"
      ? undefined
      : unwrap((resource as any).latest);
  [resource] = createResource(
    () => subFetch(fn, untrack(prev)),
    v => v,
    {
      ...options,
      storage: (init: T | undefined) => createDeepSignal(init, options.reconcile)
    } as any
  );
  return () => resource();
}

function createDeepSignal<T>(value: T | undefined, options?: ReconcileOptions) {
  const [store, setStore] = createStore({
    value
  });
  return [
    () => store.value,
    (v: T) => {
      typeof v === "function" && (v = v());
      setStore("value", reconcile(v, options));
      return store.value;
    }
  ] as [Accessor<T | null>, Setter<T | null>];
}

// mock promise while hydrating to prevent fetching
class MockPromise {
  static all() {
    return new MockPromise();
  }
  static allSettled() {
    return new MockPromise();
  }
  static any() {
    return new MockPromise();
  }
  static race() {
    return new MockPromise();
  }
  static reject() {
    return new MockPromise();
  }
  static resolve() {
    return new MockPromise();
  }
  catch() {
    return new MockPromise();
  }
  then() {
    return new MockPromise();
  }
  finally() {
    return new MockPromise();
  }
}

function subFetch<T>(fn: (prev: T | undefined) => Promise<T>, prev: T | undefined) {
  if (isServer || !sharedConfig.context) return fn(prev);
  const ogFetch = fetch;
  const ogPromise = Promise;
  try {
    window.fetch = () => new MockPromise() as any;
    Promise = MockPromise as any;
    return fn(prev);
  } finally {
    window.fetch = ogFetch;
    Promise = ogPromise;
  }
}
