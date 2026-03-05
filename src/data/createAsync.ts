/**
 * Wrapper around Solid 2.0 async createMemo.
 *
 * In Solid 2.0, createMemo can return a Promise and the reactive graph
 * handles suspension automatically.  `createAsync` is therefore a thin
 * wrapper that feeds the user-supplied async function into createMemo
 * and exposes a `.latest` convenience property.
 */
import { createMemo, latest as solidLatest } from "solid-js";
import { isServer } from "@solidjs/web";

export type AccessorWithLatest<T> = {
  (): T;
  latest: T;
};

/** Options for store reconciliation in Solid 2.0 */
export interface ReconcileOptions {
  key?: string | ((item: any) => any);
  merge?: boolean;
}

export function createAsync<T>(
  fn: (prev: T) => Promise<T>,
  options: {
    name?: string;
    initialValue: T;
    deferStream?: boolean;
  }
): AccessorWithLatest<T>;
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
  }
): AccessorWithLatest<T | undefined>;
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
  }
): AccessorWithLatest<T | undefined> {
  // In Solid 2.0, createMemo natively handles Promises.
  // The memo suspends until the promise resolves; <Loading> catches it.
  const memo = createMemo(() => fn(undefined));

  const resultAccessor: AccessorWithLatest<T> = (() => memo()) as any;
  Object.defineProperty(resultAccessor, "latest", {
    get() {
      return solidLatest(memo);
    }
  });

  return resultAccessor;
}

export function createAsyncStore<T>(
  fn: (prev: T) => Promise<T>,
  options: {
    name?: string;
    initialValue: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  }
): AccessorWithLatest<T>;
export function createAsyncStore<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  }
): AccessorWithLatest<T | undefined>;
export function createAsyncStore<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean;
    reconcile?: ReconcileOptions;
  } = {}
): AccessorWithLatest<T | undefined> {
  // Derived store form: createStore(fn) in Solid 2.0 creates a projection.
  // For now, fall back to the same async memo approach.
  const memo = createMemo(() => fn(undefined));

  const resultAccessor: AccessorWithLatest<T> = (() => memo()) as any;
  Object.defineProperty(resultAccessor, "latest", {
    get() {
      return solidLatest(memo);
    }
  });

  return resultAccessor;
}
