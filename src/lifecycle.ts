import { isServer } from "solid-js/web";
import { BeforeLeaveLifecycle, BeforeLeaveListener, LocationChange, NavigateOptions } from "./types.js";

export function createBeforeLeave(): BeforeLeaveLifecycle {
  let listeners = new Set<BeforeLeaveListener>();

  function subscribe(listener: BeforeLeaveListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  let ignore = false;
  function confirm(to: string | number, options?: Partial<NavigateOptions>) {
    if (ignore) return !(ignore = false);
    const e = {
      to,
      options,
      defaultPrevented: false,
      preventDefault: () => ((e.defaultPrevented as boolean) = true)
    };
    for (const l of listeners)
      l.listener({
        to,
        options,
        // delegate to the shared event so later listeners' preventDefault
        // calls are observable from earlier listeners
        get defaultPrevented() {
          return e.defaultPrevented;
        },
        preventDefault: e.preventDefault,
        from: l.location,
        retry: (force?: boolean) => {
          force && (ignore = true);
          l.navigate(to as string, {...options, resolve: false});
        }
      });
    return !e.defaultPrevented;
  }

  return {
    subscribe,
    confirm
  };
}

// The following supports browser initiated blocking (eg back/forward)

let depth: number;
export function saveCurrentDepth() {
  const h = window.history;
  let d = h.state && h.state._depth;
  if (d == null) {
    // An entry the router didn't push (e.g. a `#anchor` jump) sits one above
    // the last known one. `history.length` stops growing once the browser's
    // session history is full, so only fall back to it when nothing is known.
    d = depth == null ? h.length - 1 : depth + 1;
    h.replaceState({ ...h.state, _depth: d }, "");
  }
  depth = (h.state && h.state._depth) ?? d;
}
if (!isServer) {
  saveCurrentDepth();
}

export function keepDepth(state: any) {
  return {
    ...state,
    _depth: window.history.state && window.history.state._depth
  };
}

// A pushed entry sits one above the current one. Stamp it from the current
// depth, not `history.length`: once the browser's session history is full (50
// entries in Chromium and Firefox) a push drops the oldest entry and `length`
// stays the same, so `length - 1` would give every new entry the depth of the
// one below it.
export function nextDepth(state: any) {
  const current = (window.history.state && window.history.state._depth) ?? depth;
  return {
    ...state,
    _depth: (current ?? window.history.length - 1) + 1
  };
}

export function notifyIfNotBlocked(
  notify: (value?: string | LocationChange) => void,
  block: (delta: number | null) => boolean
) {
  let ignore = false;
  return () => {
    const prevDepth = depth;
    saveCurrentDepth();
    const delta = prevDepth == null ? null : depth - prevDepth;
    if (ignore) {
      ignore = false;
      return;
    }
    if (delta && block(delta)) {
      ignore = true;
      window.history.go(-delta);
    } else {
      notify();
    }
  };
}
