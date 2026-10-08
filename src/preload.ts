import { registerElementClaim } from "@solidjs/web";
import { getOwner, onCleanup } from "solid-js";
import { setLinkPreloader } from "./data/events.js";
import { preloadRoute } from "./preloadRoute.js";
import type { LinkPreload, LinkPreloadContext } from "./types.js";

type Anchor = HTMLAnchorElement | SVGAElement;

// `preload="false"` opts a link out of every strategy
function target(anchor: LinkPreloadContext["anchor"], evt: Event) {
  const res = anchor(evt);
  return res && res[0].getAttribute("preload") !== "false" ? res : undefined;
}

// preloads are not interactions: these listeners run outside any frame
function listen(types: string[], fn: (evt: Event) => void) {
  setLinkPreloader(preloadRoute);
  types.forEach(t => document.addEventListener(t, fn, { passive: true }));
  onCleanup(() => types.forEach(t => document.removeEventListener(t, fn)));
}

const preloadOn =
  ({ anchor, preload }: LinkPreloadContext, data: boolean) =>
  (evt: Event) => {
    const res = target(anchor, evt);
    res && preload(res[1], data);
  };

/**
 * Anchors as the runtime claims them: at creation and again on `href`
 * writes. `disarm` runs when the creating owner is disposed. Claims fire
 * before dynamic attributes are applied (solidjs/solid#3923), so whether a
 * link is opted in, and where it points, is read when it preloads.
 */
function claimAnchors(arm: (a: Anchor) => void, disarm: (a: Anchor) => void) {
  const seen = new WeakSet<Node>();
  setLinkPreloader(preloadRoute);
  onCleanup(
    registerElementClaim(node => {
      if (node.nodeName.toUpperCase() !== "A") return;
      arm(node as Anchor);
      // a re-claim runs under the owner writing `href`, not the anchor's
      if (seen.has(node)) return;
      seen.add(node);
      getOwner() && onCleanup(() => disarm(node as Anchor));
    })
  );
}

// requests made before the browser is idle run together once it is
function whenIdle(fn: () => void) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    ((window as any).requestIdleCallback || setTimeout)(() => {
      scheduled = false;
      fn();
    });
  };
}

/**
 * Preloads an ambient strategy's anchor: one that names the strategy in its
 * `preload` attribute, or with `all` any but `preload="false"`. Skipped when
 * the user asked to save data or the connection is 2g (where the Network
 * Information API is available).
 */
const ambientPreload =
  ({ url, preload }: LinkPreloadContext, name: string, all: boolean | undefined, data: boolean) =>
  (a: Anchor) => {
    const value = a.getAttribute("preload");
    const connection = (navigator as any).connection;
    const href =
      (value === name || (all && value !== "false")) &&
      !(connection && (connection.saveData || /2g/.test(connection.effectiveType))) &&
      url(a);
    href && preload(href, data);
  };

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
  ctx => {
    let timeout: ReturnType<typeof setTimeout>;
    let lastElement: Node | undefined;
    listen(["focusin", "touchstart"], preloadOn(ctx, data));
    listen(["mousemove"], evt => {
      clearTimeout(timeout);
      const res = target(ctx.anchor, evt);
      if (!res) return (lastElement = undefined);
      const [a, url] = res;
      if (lastElement === a) return;
      timeout = setTimeout(() => {
        ctx.preload(url, data);
        lastElement = a;
      }, delay);
    });
    onCleanup(() => clearTimeout(timeout));
  };

/**
 * Preload a link on `pointerdown` (mouse, touch, or pen), ahead of its
 * click. Warms route code and, unless `data` is false, route data.
 */
export const tapPreload =
  ({ data = true }: { data?: boolean } = {}): LinkPreload =>
  ctx =>
    listen(["pointerdown"], preloadOn(ctx, data));

/**
 * Preload a link once it has stayed in the viewport for `delay` ms, when the
 * browser is next idle. Each link preloads once, and again after its `href`
 * changes. Applies to links with `preload="viewport"`, or with `all` to
 * every link. Warms route code only unless `data` is true.
 */
export const viewportPreload =
  ({
    all,
    data = false,
    delay = 100,
    rootMargin
  }: { all?: boolean; data?: boolean; delay?: number; rootMargin?: string } = {}): LinkPreload =>
  ctx => {
    if (typeof IntersectionObserver === "undefined") return;
    const warm = ambientPreload(ctx, "viewport", all, data);
    // visible anchors: a pending dwell timer, or `true` once due
    const visible = new Map<Element, ReturnType<typeof setTimeout> | true>();
    let observer: IntersectionObserver | undefined;
    const leave = (a: Element) => {
      clearTimeout(visible.get(a) as ReturnType<typeof setTimeout>);
      visible.delete(a);
    };
    const flush = whenIdle(() =>
      visible.forEach((due, a) => {
        if (due !== true) return;
        observer!.unobserve(a);
        visible.delete(a);
        warm(a as Anchor);
      })
    );
    const intersect = (entries: IntersectionObserverEntry[]) =>
      entries.forEach(({ target: a, isIntersecting }) =>
        isIntersecting
          ? visible.set(
              a,
              setTimeout(() => (visible.set(a, true), flush()), delay)
            )
          : leave(a)
      );
    claimAnchors(
      a => (observer ||= new IntersectionObserver(intersect, { rootMargin })).observe(a),
      a => {
        observer!.unobserve(a);
        leave(a);
      }
    );
    onCleanup(() => {
      observer && observer.disconnect();
      visible.forEach((_, a) => leave(a));
    });
  };

/**
 * Preload links as soon as the page has loaded and the browser is idle,
 * including links mounted later. Applies to links with `preload="eager"`,
 * or with `all` to every link. Warms route code only unless `data` is true.
 */
export const eagerPreload =
  ({ all, data = false }: { all?: boolean; data?: boolean } = {}): LinkPreload =>
  ctx => {
    const warm = ambientPreload(ctx, "eager", all, data);
    const queue = new Set<Anchor>();
    const flush = whenIdle(() => {
      queue.forEach(warm);
      queue.clear();
    });
    addEventListener("load", flush, { once: true });
    claimAnchors(
      a => {
        queue.add(a);
        document.readyState === "complete" && flush();
      },
      a => queue.delete(a)
    );
    onCleanup(() => {
      removeEventListener("load", flush);
      queue.clear();
    });
  };
