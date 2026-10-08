import { onCleanup, onSettled, runWithOwner } from "solid-js";
import { bindEvent, saveCurrentDepth } from "./history.js";
import type { RouterHistory } from "./history.js";

const STORAGE_KEY = "solid-router:scroll";
const AUTO_KEY = "solid-router:scroll-auto";

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
 * Restoration is a single scroll once the traversal settles — the same strategy
 * SvelteKit, TanStack Router and React Router use. Settling after the
 * transition commits is what makes the offset reachable; chasing a still-
 * growing document afterwards (a ResizeObserver re-asserting the offset as
 * content arrives) was tried and removed: no peer router does it, an
 * unbounded observer re-clamps the viewport to the bottom when the target is
 * never reachable (a list that is genuinely shorter now), and scroll-induced
 * layout changes can feed it back into itself. Content that commits after the
 * transition settles — an image without reserved space, a boundary below the
 * fold — keeps whatever offset the document can hold.
 *
 * A server-rendered document load is the exception: the browser restores it
 * natively once the document — streamed boundaries included — has loaded,
 * which a restore at the first client flush cannot match. So an entry is
 * handed back to the browser (`auto`) whenever its document may unload
 * (pagehide), and a hydrating router arriving on a handed-back entry leaves
 * the restore to the browser: it does not scroll, and it takes the entry back
 * (`manual`) only after load or at the first client navigation, whichever
 * comes first. A programmatic scroll during the load cancels the native
 * restore in Firefox and WebKit, and WebKit restores just after the load
 * event, so a `manual` write before then — inside a load listener included —
 * suppresses it; the write waits a task. Handed-back depths are tracked here
 * rather than read from `history.scrollRestoration`, which Firefox reports as
 * the mode before pagehide after a reload. An entry this router pushed and
 * never handed back stays `manual` and gets no native restore, so the router
 * restores it as on a client-rendered load.
 */
export function createScrollRestoration(hydrating?: boolean) {
  const h = window.history;
  // the current entry needs its depth stamp for captures to have a key, even
  // if something replaced history.state after the adapter stamped it
  saveCurrentDepth();
  const depth = (): number | undefined => window.history.state && window.history.state._depth;
  let positions: Record<string, number> = {};
  let handedBack: Record<string, 1> = {};
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) || {};
    handedBack = JSON.parse(sessionStorage.getItem(AUTO_KEY)!) || {};
  } catch {}

  const manual = () => {
    h.scrollRestoration = "manual";
    const d = depth();
    if (d != null) delete handedBack[d];
  };
  const d = depth();
  let deferred = !!hydrating && (h.scrollRestoration === "auto" || (d != null && !!handedBack[d]));
  if (!deferred) manual();
  const claim = () => {
    if (!deferred) return;
    deferred = false;
    manual();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;

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
      h.scrollRestoration = "auto";
      const d = depth();
      if (d != null) handedBack[d] = 1;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
        sessionStorage.setItem(AUTO_KEY, JSON.stringify(handedBack));
      } catch {}
    }),
    bindEvent(window, "pageshow", e => {
      if ((e as PageTransitionEvent).persisted) manual();
    }),
    bindEvent(window, "load", () => deferred && (timer = setTimeout(claim))),
    () => clearTimeout(timer)
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
    /**
     * When the adapter notifies a traversal: mark the target and restore once
     * the transition carrying it settles. The adapter notifies right before
     * the location write, in the same tick, so the settle is that write's —
     * a same-URL traversal included, which no location key would see.
     */
    onPop() {
      claim();
      pending = depth();
      runWithOwner(null, () => onSettled(restore));
    },
    /** The initial page settled: restore a reload/back_forward arrival. */
    settled: () => restore(),
    /** Before a client navigation writes history: the entry it creates copies the current mode. */
    beforeWrite: claim,
    /** After a push: forward entries died, and this depth may be reused. */
    onPush() {
      const d = depth();
      if (d != null) {
        for (const k in positions) +k >= d && delete positions[k];
        for (const k in handedBack) +k >= d && delete handedBack[k];
      }
    },
    create() {
      onCleanup(() => unbind.forEach(u => u()));
      // reload/back_forward document loads land on an existing entry (a fresh
      // navigation starts a new one and belongs at the top); the router calls
      // `settled` once the initial page has; a deferred arrival is the browser's
      if (deferred) {
        document.readyState === "complete" && claim();
        return;
      }
      const [nav] = performance.getEntriesByType?.("navigation") as PerformanceNavigationTiming[];
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
      restoration.beforeWrite();
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
