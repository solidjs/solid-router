import { BeforeLeaveLifecycle, BeforeLeaveListener, NavigateOptions } from "./types";

export function createBeforeLeave(): BeforeLeaveLifecycle {
  let listeners = new Set<BeforeLeaveListener>();

  function subscribe(listener: BeforeLeaveListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  let ignore = false;
  function confirm(to: string | number, options?: Partial<NavigateOptions>) {
    if (ignore) return true;
    const e = {
      to,
      options,
      defaultPrevented: false,
      preventDefault: () => ((e.defaultPrevented as boolean) = true)
    };
    for (const l of listeners)
      l.listener({
        ...e,
        from: l.router.location,
        retry: (force?: boolean) => {
          force && (ignore = true);
          try {
            l.router.navigatorFactory()(to as string, options);
          } finally {
            force && (ignore = false);
          }
        }
      });
    return !e.defaultPrevented;
  }

  return {
    subscribe,
    confirm
  };
}
