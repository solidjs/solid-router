import type { LocationChange, RouterUtils } from "../types.js";
import { createBeforeLeave, keepDepth, notifyIfNotBlocked, saveCurrentDepth } from "../lifecycle.js";
import { bindEvent, scrollToHash } from "./createRouter.js";

/**
 * A history adapter: the source of truth for the current URL and how
 * navigations write back to it. Adapters are plain imported values so
 * unused ones never enter the bundle — `createRouter` defaults to browser
 * history on the client and the request URL on the server.
 */
export interface RouterHistory {
  get: () => string | LocationChange;
  set: (next: LocationChange) => void;
  init?: (notify: (value?: string | LocationChange) => void) => () => void;
  utils?: Partial<RouterUtils>;
}

export function browserHistory(): RouterHistory {
  const getSource = () => {
    const url = window.location.pathname + window.location.search;
    const state =
      window.history.state &&
      window.history.state._depth &&
      Object.keys(window.history.state).length === 1
        ? undefined
        : window.history.state;
    return {
      value: url + window.location.hash,
      state
    };
  };
  const beforeLeave = createBeforeLeave();
  return {
    get: getSource,
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
      saveCurrentDepth();
    },
    init: notify =>
      bindEvent(
        window,
        "popstate",
        notifyIfNotBlocked(notify, delta => {
          if (delta) {
            return !beforeLeave.confirm(delta);
          } else {
            const s = getSource();
            return !beforeLeave.confirm(s.value, { state: s.state });
          }
        })
      ),
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  };
}

export function hashParser(str: string) {
  const to = str.replace(/^.*?#/, "");
  // Hash-only hrefs like `#foo` from plain anchors will come in as `/#foo` whereas a link to
  // `/foo` will be `/#/foo`. Check if the to starts with a `/` and if not append it as a hash
  // to the current path so we can handle these in-page anchors correctly.
  if (!to.startsWith("/")) {
    const [, path = "/"] = window.location.hash.split("#", 2);
    return `${path}#${to}`;
  }
  return to;
}

export function hashHistory(): RouterHistory {
  const getSource = () => window.location.hash.slice(1);
  const beforeLeave = createBeforeLeave();
  return {
    get: getSource,
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", "#" + value);
      } else {
        window.history.pushState(state, "", "#" + value);
      }
      const hashIndex = value.indexOf("#");
      const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
      scrollToHash(hash, scroll);
      saveCurrentDepth();
    },
    init: notify =>
      bindEvent(
        window,
        "hashchange",
        notifyIfNotBlocked(notify, delta => !beforeLeave.confirm(delta && delta < 0 ? delta : getSource()))
      ),
    utils: {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: hashParser,
      beforeLeave
    }
  };
}

export interface MemoryHistoryAdapter extends RouterHistory {
  get: () => string;
  go: (delta: number) => void;
  back: () => void;
  forward: () => void;
  listen: (listener: (value: string) => void) => () => void;
}

export function memoryHistory(initial: string = "/"): MemoryHistoryAdapter {
  const entries = [initial];
  let index = 0;
  const listeners: ((value: string) => void)[] = [];

  const go = (n: number) => {
    // https://github.com/remix-run/react-router/blob/682810ca929d0e3c64a76f8d6e465196b7a2ac58/packages/router/history.ts#L245
    index = Math.max(0, Math.min(index + n, entries.length - 1));

    const value = entries[index];
    listeners.forEach(listener => listener(value));
  };

  const listen = (listener: (value: string) => void) => {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      listeners.splice(i, 1);
    };
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

      listeners.forEach(listener => listener(value));

      setTimeout(() => {
        if (scroll) {
          scrollToHash(value.split("#")[1] || "", true);
        }
      }, 0);
    },
    back: () => go(-1),
    forward: () => go(1),
    go,
    listen,
    init: listen,
    utils: { go }
  };
}
