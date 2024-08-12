import { type Signal, createSignal, onCleanup, sharedConfig } from "solid-js";
import type { LocationChange, RouterContext, RouterUtils } from "../types.ts";
import { createRouterComponent } from "./components.jsx";

function intercept<T>(
  [value, setValue]: [() => T, (v: T) => void],
  get?: (v: T) => T,
  set?: (v: T) => T
): [() => T, (v: T) => void] {
  return [get ? () => get(value()) : value, set ? (v: T) => setValue(set(v)) : setValue];
}

function querySelector<T extends Element>(selector: string) {
  if (selector === "#") {
    return null;
  }
  // Guard against selector being an invalid CSS selector
  try {
    return document.querySelector<T>(selector);
  } catch (e) {
    return null;
  }
}

export function createRouter(config: {
  get: () => string | LocationChange,
  set: (next: LocationChange) => void,
  init?: (notify: (value?: string | LocationChange) => void) => () => void,
  create?: (router: RouterContext) => void,
  utils?: Partial<RouterUtils>
}) {
  let ignore = false;
  const wrap = (value: string | LocationChange) => (typeof value === "string" ? { value } : value);
  const signal = intercept<LocationChange>(
    createSignal(wrap(config.get()), {
      equals: (a, b) => a.value === b.value && a.state === b.state
    }),
    undefined,
    next => {
      !ignore && config.set(next);
      if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
      return next;
    }
  ) as Signal<LocationChange>;

  config.init &&
    onCleanup(
      config.init((value = config.get()) => {
        ignore = true;
        signal[1](wrap(value));
        ignore = false;
      })
    );

  return createRouterComponent({
    signal,
    create: config.create,
    utils: config.utils
  });
}

export function bindEvent(target: EventTarget, type: string, handler: EventListener) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

export function scrollToHash(hash: string, fallbackTop?: boolean) {
  const el = querySelector(`#${hash}`);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}
