import { createEffect, on, onCleanup } from "solid-js";
import { saveCurrentDepth } from "../lifecycle.js";
import type { RouterContext } from "../types.js";
import { bindEvent } from "./createRouter.js";

const STORAGE_KEY = "solid-router:scroll";

/**
 * Explicit scroll restoration for back/forward navigation. The browser's
 * native same-document heuristic is unreliable for suspense-driven rendering:
 * if the destination route forces a layout while the document is still short,
 * the saved offset for the previous entry is clamped and lost (#577).
 *
 * Positions are captured continuously from the scroll event, keyed by the
 * `_depth` the router already stamps on every history entry — capturing at
 * scroll time (rather than at exit) stays correct through `useBeforeLeave`
 * blocked/reverted traversals. The map persists to sessionStorage on pagehide
 * so restoration survives reloads, which `scrollRestoration = "manual"`
 * otherwise disables. Restoration runs once routing settles; if the document
 * is still shorter than the target (a boundary below the fold hasn't
 * resolved), a ResizeObserver retries as content grows, cancelled by the
 * first user scroll.
 */
export function createScrollRestoration() {
  window.history.scrollRestoration = "manual";
  // the current entry needs its depth stamp for captures to have a key, even
  // if something replaced history.state after the lifecycle module loaded
  saveCurrentDepth();
  let positions: Record<string, number> = {};
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) || {};
  } catch {}

  const depth = (): number | undefined => window.history.state && window.history.state._depth;

  let programmatic = false;
  let pending: number | undefined;
  let disconnect: (() => void) | undefined;
  const cancelGuard = () => {
    disconnect && disconnect();
    disconnect = undefined;
  };

  const unbind = [
    bindEvent(window, "scroll", () => {
      const d = depth();
      if (d != null) positions[d] = window.scrollY;
      if (!programmatic) {
        // the user took over — a pending or chasing restore would yank them
        pending = undefined;
        cancelGuard();
      }
    }),
    bindEvent(window, "pagehide", () => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
      } catch {}
    })
  ];

  const restore = () => {
    if (pending == null) return;
    const y = positions[pending];
    pending = undefined;
    if (y == null) return;
    cancelGuard();
    const attempt = () => {
      programmatic = true;
      window.scrollTo(0, y);
      programmatic = false;
      // reachable once the document is tall enough to hold the offset
      return document.documentElement.scrollHeight - window.innerHeight >= y;
    };
    if (!attempt() && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => attempt() && cancelGuard());
      observer.observe(document.documentElement);
      disconnect = () => observer.disconnect();
    }
  };

  return {
    /** Before the router reacts to a popstate: mark the traversal target. */
    onPop() {
      pending = depth();
    },
    /** After a push: forward entries died, and this depth may be reused. */
    onPush() {
      const d = depth();
      if (d != null) for (const k in positions) +k >= d && delete positions[k];
    },
    create(router: RouterContext) {
      createEffect(on(router.isRouting, routing => routing || restore(), { defer: true }));
      onCleanup(() => {
        unbind.forEach(u => u());
        cancelGuard();
      });
      // reload/back_forward document loads land on an existing entry; a fresh
      // navigation starts a new one and belongs at the top
      const [nav] = (performance.getEntriesByType &&
        performance.getEntriesByType("navigation")) as PerformanceNavigationTiming[];
      if (nav && nav.type !== "navigate") {
        pending = depth();
        restore();
      }
    }
  };
}
