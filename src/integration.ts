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

function querySelector<T extends Element>(selector: string) {
  // Guard against selector being an invalid CSS selector
  try {
    return document.querySelector<T>(selector);
  } catch (e) {
    return null;
  }
}

function scrollToHash(hash: string, fallbackTop?: boolean) {
  const el = querySelector(`#${hash}`);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}

/**
 * Store location history in a local variable.
 *
 * (other router integrations "store" state as urls in browser history)
 */
export function createMemoryHistory() {
  const entries = ["/"];
  let index = 0;
  const listeners: ((value: string) => void)[] = [];

  const go = (n: number) => {
    // https://github.com/remix-run/react-router/blob/682810ca929d0e3c64a76f8d6e465196b7a2ac58/packages/router/history.ts#L245
    index = Math.max(0, Math.min(index + n, entries.length - 1));

    const value = entries[index];
    listeners.forEach(listener => listener(value));
  };

  return {
    get: () => entries[index],
    set: ({ value, scroll, replace }: LocationChange) => {
      if (replace) {
        entries[index] = value;
      } else {
        entries.splice(index + 1, entries.length - index, value);
        index++;
      }
      if (scroll) {
        scrollToHash(value.split("#")[1] || "", true);
      }
    },
    back: () => {
      go(-1);
    },
    forward: () => {
      go(1);
    },
    go,
    listen: (listener: (value: string) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        listeners.splice(index, 1);
      };
    }
  };
}

type NotifyLocationChange = (value?: string | LocationChange) => void;

type CreateLocationChangeNotifier = (
  notify: NotifyLocationChange
) => /* LocationChangeNotifier: */ () => void;

export function createIntegration(
  get: () => string | LocationChange,
  set: (next: LocationChange) => void,
  init?: CreateLocationChangeNotifier,
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
      scrollToHash(window.location.hash.slice(1), scroll);
    },
    notify => bindEvent(window, "popstate", () => notify()),
    {
      go: delta => window.history.go(delta)
    }
  );
}

/**
 * If your Solidjs "app" is really just a "widget" or "micro-frontend" that will be embedded into a larger app,
 * you can use this router integration to embed your entire url into a *single* search parameter.
 *
 * This is done by taking your "app"s normal url, and passing it through `encodeURIComponent` and `decodeURIComponent`.
 *
 * If your widget has search params, they will not leak into the parent/host app, and your solid app should not pickup parents search params, unless your Solid code is reading from `window.location`.
 */
// This implementation was based on pathIntegration, with many ideas and concepts taken from hashIntegration.
export function searchParamIntegration(
  /**
   * Let's say you are building a chat widget that will be integrated into a larger app.
   *
   * You want to pass in a globally unique search param key here, perhaps "supportChatWidgetUrl"
   */
  widgetUrlsSearchParamName: string
) {
  function getWidgetsUrl(searchParams: URLSearchParams): string {
    return decodeURIComponent(
      searchParams.get(widgetUrlsSearchParamName) || encodeURIComponent("/")
    );
  }

  const createLocationChangeNotifier: CreateLocationChangeNotifier = notify => {
    return bindEvent(window, "popstate", () => notify());
  };

  return createIntegration(
    () => ({
      value: getWidgetsUrl(new URLSearchParams(window.location.search)),
      state: history.state
    }),
    ({ value, replace, state }) => {
      if (replace) {
        window.history.replaceState(state, "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      // Because the above `pushState/replaceState` call should never change `window.location.hash`,
      // this behavior from `pathIntegration` doesn't make sense in the context of `searchParamIntegration`:
      //   scrollToHash(window.location.hash.slice(1), scroll);
      // Perhaps when a widget loads, it should run the `el.scrollIntoView` function itself.
    },
    /* init */
    createLocationChangeNotifier,
    {
      go: delta => window.history.go(delta),
      renderPath: path => {
        const params = new URLSearchParams(window.location.search);
        params.set(widgetUrlsSearchParamName, encodeURIComponent(path));
        // Starts with `?` because we don't want to change the path at all
        // This degrades gracefully if javascript is disabled
        return `?${params.toString()}`;
      },
      parsePath: str => {
        const url = new URL(str, "https://github.com/");
        return getWidgetsUrl(url.searchParams);
      }
    }
  );
}

export function hashIntegration() {
  return createIntegration(
    () => window.location.hash.slice(1),
    ({ value, replace, scroll, state }) => {
      if (replace) {
        window.history.replaceState(state, "", "#" + value);
      } else {
        window.location.hash = value;
      }
      const hashIndex = value.indexOf("#");
      const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
      scrollToHash(hash, scroll);
    },
    notify => bindEvent(window, "hashchange", () => notify()),
    {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: str => {
        // Get everything after the `#` (by dropping everything before the `#`)
        const to = str.replace(/^.*?#/, "");
        if (!to.startsWith("/")) {
          // We got an in-page heading link.
          // Append it to the current path to maintain correct browser behavior.
          const [, path = "/"] = window.location.hash.split("#", 2);
          return `${path}#${to}`;
        }
        return to; // Normal Solidjs <A> link
      }
    }
  );
}

export function memoryIntegration() {
  const memoryHistory = createMemoryHistory();
  return createIntegration(memoryHistory.get, memoryHistory.set, memoryHistory.listen, {
    go: memoryHistory.go
  });
}
