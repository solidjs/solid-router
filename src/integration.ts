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
  get: () => string,
  set: (next: LocationChange) => void,
  init?: (notify: (value?: string) => void) => () => void,
  utils?: Partial<RouterUtils>
): RouterIntegration {
  let ignore = false;
  const signal = intercept<LocationChange>(
    createSignal({ value: get() }, { equals: (a, b) => a.value === b.value }),
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
        signal[1]({ value });
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
    () => window.location.pathname + window.location.search + window.location.hash,
    ({ value, replace }) => {
      if (replace) {
        window.history.replaceState(null, "", value);
      } else {
        window.history.pushState(null, "", value);
      }
      window.scrollTo(0, 0);
    },
    notify => bindEvent(window, "popstate", () => notify())
  );
}

export function hashIntegration() {
  return createIntegration(
    () => window.location.hash.slice(1),
    ({ value }) => {
      window.location.hash = value;
      window.scrollTo(0, 0);
    },
    notify => bindEvent(window, "hashchange", () => notify()),
    {
      renderPath: path => `#${path}`
    }
  );
}
