import { createSignal, onCleanup } from "solid-js";
import type { LocationChange, LocationChangeSignal, RouterIntegration, RouterUtils } from "./types";

function bindEvent(target: EventTarget, type: string, handler: EventListener) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

function intercept<T>(
  [value, setValue]: [() => T, (v: T) => void],
  get?: (v: T) => T,
  set?: (v: T) => T
): [() => T, (v: T) => void] {
  return [get ? () => get(value()) : value, set ? (v: T) => setValue(set(v)) : setValue];
}

export function createIntegration(
  get: () => string | LocationChange,
  set: (next: LocationChange) => void,
  init?: (notify: (value?: string | LocationChange) => void) => () => void,
  utils?: Partial<RouterUtils>
): RouterIntegration {
  let ignore = false;
  const wrap = (value: string | LocationChange) => (typeof value === "string" ? { value } : value);
  const signal = intercept<LocationChange>(
    createSignal(wrap(get()), { equals: (a, b) => a.value === b.value }),
    undefined,
    next => {
      !ignore && set(next);
      return next;
    }
  );

  init &&
    onCleanup(
      init((value = get()) => {
        ignore = true;
        signal[1](wrap(value));
        ignore = false;
      })
    );

  return {
    signal,
    utils
  };
}

export function normalizeIntegration(
  integration: RouterIntegration | LocationChangeSignal | undefined
): RouterIntegration {
  if (!integration) {
    return {
      signal: createSignal({ value: "" })
    };
  } else if (Array.isArray(integration)) {
    return {
      signal: integration
    };
  }
  return integration;
}

export function staticIntegration(obj: LocationChange): RouterIntegration {
  return {
    signal: [() => obj, next => Object.assign(obj, next)]
  };
}

export function pathIntegration() {
  return createIntegration(
    () => ({
      value: window.location.pathname + window.location.search + window.location.hash,
      state: history.state
    }),
    ({ value, replace, scroll, state }) => {
      if (replace) {
        window.history.replaceState(state, "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      if (scroll) {
        window.scrollTo(0, 0);
      }
    },
    notify => bindEvent(window, "popstate", () => notify()),
    {
      go: delta => window.history.go(delta)
    }
  );
}

export function hashIntegration() {
  return createIntegration(
    () => window.location.hash.slice(1),
    ({ value, scroll }) => {
      window.location.hash = value;
      if (scroll) {
        window.scrollTo(0, 0);
      }
    },
    notify => bindEvent(window, "hashchange", () => notify()),
    {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: str => str.replace(/^.*?#/, "")
    }
  );
}
