import { onCleanup } from "solid-js";
import { useLocation, useNavigate, useRouter } from "./routing.js";
import type {
  BeforeLeaveEventArgs,
  BeforeLeaveLifecycle,
  BeforeLeaveListener,
  NavigateOptions
} from "./types.js";

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
          l.navigate(to as string, { ...options, resolve: false });
        }
      });
    return !e.defaultPrevented;
  }

  return {
    subscribe,
    confirm
  };
}

/**
 * useBeforeLeave takes a function that will be called prior to leaving a route.
 * The function will be called with:
 *
 * - from (*Location*): current location (before change).
 * - to (*string | number*): path passed to `navigate`.
 * - options (*NavigateOptions*): options passed to navigate.
 * - preventDefault (*function*): call to block the route change.
 * - defaultPrevented (*readonly boolean*): `true` if any previously called leave handlers called `preventDefault`.
 * - retry (*function*, force?: boolean ): call to retry the same navigation, perhaps after confirming with the user. Pass `true` to skip running the leave handlers again (i.e. force navigate without confirming).
 *
 * @example
 * ```js
 * useBeforeLeave((e: BeforeLeaveEventArgs) => {
 *   if (form.isDirty && !e.defaultPrevented) {
 *     // preventDefault to block immediately and prompt user async
 *     e.preventDefault();
 *     setTimeout(() => {
 *       if (window.confirm("Discard unsaved changes - are you sure?")) {
 *         // user wants to proceed anyway so retry with force=true
 *         e.retry(true);
 *       }
 *     }, 100);
 *   }
 * });
 * ```
 */
export const useBeforeLeave = (listener: (e: BeforeLeaveEventArgs) => void) => {
  // Installing the guard here (instead of eagerly in the router/history) keeps
  // all of createBeforeLeave tree-shakeable for apps that never block leaves.
  const slot = useRouter().beforeLeave;
  const s = (slot.current || (slot.current = createBeforeLeave())).subscribe({
    listener,
    location: useLocation(),
    navigate: useNavigate()
  });
  onCleanup(s);
};
