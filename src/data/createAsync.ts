/**
 * This is mock of the eventual Solid 2.0 primitive. It is not fully featured.
 */
import { type Accessor, createResource, sharedConfig } from "solid-js";
import { isServer } from "solid-js/web";
export function createAsync<T>(fn: () => Promise<T>): Accessor<T | undefined> {
  const [resource] = createResource(
    () => subFetch(fn),
    v => v
  );
  return () => resource();
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

function subFetch<T>(fn: () => Promise<T>) {
  if (isServer || !sharedConfig.context) return fn();
  const ogFetch = fetch;
  const ogPromise = Promise;
  try {
    window.fetch = () => new MockPromise() as any;
    Promise = MockPromise as any;
    return fn();
  } finally {
    window.fetch = ogFetch;
    Promise = ogPromise;
  }
}
