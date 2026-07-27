import { createEffect, onCleanup } from "solid-js";
import type { RouterContext } from "../types.js";
import { bindEvent, saveCurrentDepth } from "./history.js";
import type { RouterHistory } from "./history.js";

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
 * otherwise disables.
 *
 * Restoration is a single scroll once routing settles — the same strategy
 * SvelteKit, TanStack Router and React Router use. Settling after the
 * transition commits is what makes the offset reachable; chasing a still-
 * growing document afterwards (a ResizeObserver re-asserting the offset as
 * content arrives) was tried and removed: no peer router does it, an
 * unbounded observer re-clamps the viewport to the bottom when the target is
 * never reachable (a list that is genuinely shorter now), and scroll-induced
 * layout changes can feed it back into itself. Content that commits after the
 * transition settles — an image without reserved space, a boundary below the
 * fold — keeps whatever offset the document can hold.
 */
export function createScrollRestoration() {
  window.history.scrollRestoration = "manual";
  // the current entry needs its depth stamp for captures to have a key, even
  // if something replaced history.state after the adapter stamped it
  saveCurrentDepth();
  let positions: Record<string, number> = {};
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) || {};
  } catch {}

  const depth = (): number | undefined => window.history.state && window.history.state._depth;

  let programmatic = false;
  let pending: number | undefined;

  const unbind = [
    bindEvent(window, "scroll", () => {
      const d = depth();
      if (d != null) positions[d] = window.scrollY;
      // the user took over — a pending restore would yank them
      if (!programmatic) pending = undefined;
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
    // flagged so the resulting scroll event is not mistaken for the user
    // taking over (which cancels a pending restore)
    programmatic = true;
    window.scrollTo(0, y);
    programmatic = false;
  };

  return {
    /** When the adapter notifies a traversal: mark the target for restoration. */
    onPop() {
      pending = depth();
    },
    /** After a push: forward entries died, and this depth may be reused. */
    onPush() {
      const d = depth();
      if (d != null) for (const k in positions) +k >= d && delete positions[k];
    },
    create(router: RouterContext) {
      // Restore once the traversal has settled: key on the location (a fully
      // synchronous pop commits without isRouting ever flipping) and on
      // isRouting, which reports in-flight transitions — native pops
      // included — and holds the restore until they commit. restore() no-ops
      // unless a traversal marked a target, so push navigations are inert.
      // `transparent` keeps the effect invisible to the hydration id scheme —
      // same reasoning as the link-claims effect (claims.ts): this setup is
      // client-only, so an id-consuming node here has no server counterpart
      // and every hydration id allocated after it shifts by one child slot.
      // The visible failure is any <Loading> content that settled before the
      // shell flush (a cache hit, a preloaded query): its serialized value and
      // inlined markup are keyed under the server's ids, the shifted client
      // misses both, recomputes, and re-renders the route fresh — duplicating
      // the server DOM and leaving it inert.
      createEffect(
        () => ({
          url: router.location.pathname + router.location.search + router.location.hash,
          routing: router.isRouting()
        }),
        current => {
          if (!current.routing) restore();
        },
        { transparent: true } as {}
      );
      onCleanup(() => unbind.forEach(u => u()));
      // reload/back_forward document loads land on an existing entry (a fresh
      // navigation starts a new one and belongs at the top); the effect's
      // initial run performs the restore after first render
      const [nav] = (performance.getEntriesByType &&
        performance.getEntriesByType("navigation")) as PerformanceNavigationTiming[];
      if (nav && nav.type !== "navigate") pending = depth();
    }
  };
}

export type ScrollRestoration = ReturnType<typeof createScrollRestoration>;

/**
 * Threads restoration through a history adapter: pushes prune dead forward
 * entries, and adapter notifications (unblocked pops) mark the traversal
 * target. Notification runs after the adapter's depth bookkeeping, so the
 * marked depth is the entry being restored to.
 */
export function withScrollRestoration(
  history: RouterHistory,
  restoration: ScrollRestoration
): RouterHistory {
  return {
    ...history,
    set(next) {
      history.set(next);
      next.replace || restoration.onPush();
    },
    init:
      history.init &&
      (notify =>
        history.init!(value => {
          restoration.onPop();
          notify(value);
        }))
  };
}
