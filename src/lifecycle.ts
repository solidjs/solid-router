import { BeforeLeaveLifecycle, BeforeLeaveListener, NavigateOptions } from "./types";

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
