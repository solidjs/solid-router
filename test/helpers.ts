import { createEffect, createMemo, createRoot } from "solid-js";

export function createCounter(fn: () => void, start: number = -1) {
  return createMemo((n: number) => {
    fn();
    return n + 1;
  }, start);
}

export function waitFor(fn: () => boolean) {
  return new Promise<number>(resolve => {
    let n = 0;
    createEffect(
      () => fn(),
      result => {
        n++;
        if (result) {
          resolve(n);
        }
      }
    );
  });
}

export function createAsyncRoot(fn: (resolve: () => void, disposer: () => void) => void) {
  return new Promise<void>(resolve => {
    createRoot(disposer => fn(resolve, disposer));
  });
}

export async function awaitPromise() {
  return new Promise(resolve => setTimeout(resolve, 100));
}
