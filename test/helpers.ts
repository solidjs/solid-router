import { createEffect, createMemo, createRoot, createSignal } from "solid-js";
import { RouterContext } from "../src/types";
import { vi } from "vitest";

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

export function createMockRouter(): RouterContext {
  const [submissions, setSubmissions] = createSignal([]);
  const [singleFlight] = createSignal(false);

  return {
    submissions: [submissions, setSubmissions],
    singleFlight: singleFlight(),
    navigatorFactory: () => vi.fn(),
    base: { path: () => "/" },
    location: { pathname: "/", search: "", hash: "", query: {}, state: null, key: "" },
    isRouting: () => false,
    matches: () => [],
    navigate: vi.fn(),
    navigateFromRoute: vi.fn(),
    parsePath: (path: string) => path,
    preloadRoute: vi.fn(),
    renderPath: (path: string) => path,
    utils: {
      go: vi.fn(),
      renderPath: vi.fn(),
      parsePath: vi.fn(),
      beforeLeave: { listeners: new Set() }
    }
  } as any;
}
