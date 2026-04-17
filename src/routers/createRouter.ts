import { type Signal, createSignal, onCleanup, sharedConfig } from "solid-js";
import type { LocationChange, RouterContext, RouterUtils } from "../types.js";
import { createRouterComponent } from "./components.jsx";

export function createRouter(config: {
  get: () => string | LocationChange,
  set: (next: LocationChange) => void,
  init?: (notify: (value?: string | LocationChange) => void) => () => void,
  create?: (router: RouterContext) => void,
  utils?: Partial<RouterUtils>
}) {
  let ignore = false;
  const wrap = (value: string | LocationChange) => (typeof value === "string" ? { value } : value);
  const [read, write] = createSignal(wrap(config.get()), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
    ownedWrite: true
  });
  const signal = [read, (next: LocationChange) => {
    !ignore && config.set(next);
    if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
    write(next);
  }] as Signal<LocationChange>;

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
  const el = hash && document.getElementById(hash);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}
