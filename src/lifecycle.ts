import { isServer } from "solid-js/web";
import { BeforeLeaveLifecycle, BeforeLeaveListener, LocationChange, NavigateOptions } from "./types";

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
        ...e,
        from: l.location,
        retry: (force?: boolean) => {
          force && (ignore = true);
          l.navigate(to as string, options);
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
  if (!window.history.state || window.history.state._depth == null) {
    window.history.replaceState({ ...window.history.state, _depth: window.history.length - 1 }, "");
  }
  depth = window.history.state._depth;
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
