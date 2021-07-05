import { createSignal, onCleanup } from "solid-js";
import type {
  RouteUpdateMode,
  RouteUpdate,
  RouterIntegration,
  RouterUtils
} from "./types";
// import type { History } from "history";

function bindEvent(target: EventTarget, type: string, handler: EventListener) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

function intercept<T>(
  signal: [() => T, (v: T) => void],
  get?: (v: T) => T,
  set?: (v: T) => T
): [() => T, (v: T) => void] {
  const [value, setValue] = signal;
  return [
    get ? () => get(value()) : value,
    set ? (v: T) => setValue(set(v)) : setValue
  ];
}

export function createIntegration(
  get: () => string,
  set: (value: string, mode: RouteUpdateMode) => void,
  init?: (notify: (value?: string) => void) => () => void,
  utils?: Partial<RouterUtils>
): RouterIntegration {
  const signal = intercept<RouteUpdate>(
    createSignal({ value: get() }, { equals: (a, b) => a.value === b.value }),
    undefined,
    (next) => {
      const { value, mode } = next;
      mode && set(value, mode);
      return next;
    }
  );

  init &&
    onCleanup(
      init((value = get()) => {
        signal[1]({ value });
      })
    );

  return {
    signal,
    utils
  };
}

export function pathIntegration() {
  return createIntegration(
    () => window.location.pathname + window.location.search,
    (value, mode) => {
      if (mode === "push") {
        window.history.pushState(null, "", value);
      } else {
        window.history.replaceState(null, "", value);
      }
    },
    (notify) => bindEvent(window, "popstate", () => notify())
  );
}

export function hashIntegration() {
  return createIntegration(
    () => window.location.hash.slice(1),
    (value) => {
      window.location.hash = value;
    },
    (notify) => bindEvent(window, "hashchange", () => notify()),
    {
      renderPath: (path) => `#${path}`
    }
  );
}

// export function historyIntegration(history: History) {
//   return createIntegration(
//     () => history.location.pathname + history.location.search,
//     (value, mode) => {
//       if (mode === "push") {
//         history.push(value);
//       } else {
//         history.replace(value);
//       }
//     },
//     (notify) =>
//       history.listen((evt) => {
//         if (evt.action === "POP") {
//           notify();
//         }
//       }),
//     {
//       renderPath: history.createHref
//     }
//   );
// }
