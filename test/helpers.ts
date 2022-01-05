import { createEffect, createMemo, createRoot } from "solid-js";

export function createCounter(fn: () => void, start: number = -1) {
  return createMemo((n: number) => {
    fn();
    return n + 1;
  }, start);
}

export function waitFor(fn: () => boolean) {
  return new Promise<number>(resolve => {
    createEffect<number>((n = 0) => {
      if (fn()) {
        resolve(n);
      }
      return n + 1;
    });
  });
}

export function createAsyncRoot(fn: (resolve: () => void, disposer: () => void) => void) {
  return new Promise<void>(resolve => {
    createRoot(disposer => fn(resolve, disposer));
  });
}
