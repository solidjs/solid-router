import { onCleanup } from "solid-js";
import type { LinkPreload, LinkPreloadContext } from "./types.js";

// `preload="false"` opts a link out of every strategy
function target(anchor: LinkPreloadContext["anchor"], evt: Event) {
  const res = anchor(evt);
  return res && res[0].getAttribute("preload") !== "false" ? res : undefined;
}

// preloads are not interactions: these listeners run outside any frame
function listen(types: string[], fn: (evt: Event) => void) {
  types.forEach(t => document.addEventListener(t, fn, { passive: true }));
  onCleanup(() => types.forEach(t => document.removeEventListener(t, fn)));
}

/**
 * Preload a link when the pointer rests on it for `delay` ms, when it takes
 * focus, and on touchstart. Warms route code and, unless `data` is false,
 * runs the matched routes' `preload` functions.
 *
 * @example
 * ```ts
 * const Router = createRouter({ routes, preloadLinks: intentPreload() });
 * ```
 */
export const intentPreload =
  ({ delay = 20, data = true }: { delay?: number; data?: boolean } = {}): LinkPreload =>
  ({ anchor, preload }) => {
    let timeout: ReturnType<typeof setTimeout>;
    let lastElement: Node | undefined;
    listen(["focusin", "touchstart"], evt => {
      const res = target(anchor, evt);
      res && preload(res[1], data);
    });
    listen(["mousemove"], evt => {
      clearTimeout(timeout);
      const res = target(anchor, evt);
      if (!res) return (lastElement = undefined);
      const [a, url] = res;
      if (lastElement === a) return;
      timeout = setTimeout(() => {
        preload(url, data);
        lastElement = a;
      }, delay);
    });
    onCleanup(() => clearTimeout(timeout));
  };
