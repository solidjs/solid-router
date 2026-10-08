import { createMemo, DEV, isPending, latest, NotReadyError, runWithOwner } from "solid-js";
import type { LinksPlugin, LocationChange, RouterContext } from "./types.js";
import { linkMatcher } from "./utils.js";

/**
 * Pending navigation state, for the opt-in readers only: `useIsRouting`,
 * `useLinkState().pending` and the `pendingLinks` claims plugin. `isPending`
 * and `latest` are UI affordances — the router's own coordination reads its
 * location writes and their `onSettled` instead — so an app that renders
 * none of these never bundles Solid's verdict machinery.
 */

const routing = new WeakMap<RouterContext, () => boolean>();

/** Whether a navigation is in flight: one memo per router, under its owner. */
export function routingState(router: RouterContext): () => boolean {
  let read = routing.get(router);
  if (!read) {
    const { location, matches, _source: source } = router;
    // `transparent`: created on first use rather than at router setup, so it
    // must not take a hydration id — the server may never create it, or
    // create it at a different point.
    const pending = runWithOwner(router._owner, () =>
      createMemo(
        () =>
          isPending(() => {
            try {
              matches();
            } catch (e) {
              if (e instanceof NotReadyError) throw e;
            }
            location.search;
            location.hash;
          }),
        { transparent: true, ...(DEV && { name: "routingPending" }) } as {}
      )
    );
    read = () => pending() || isPending(source);
    routing.set(router, read);
  }
  return read;
}

/**
 * The target of the in-flight programmatic navigation, if any. A
 * back/forward traversal (`_navigation` -1) is not a link's target.
 */
export function pendingTarget(router: RouterContext): LocationChange | undefined {
  if (!routingState(router)()) return;
  const target = latest(router._source);
  return target._navigation && target._navigation > 0 ? target : undefined;
}

/** Whether `to` is the destination of the in-flight navigation. */
export function linkPending(
  router: RouterContext,
  to: string | undefined,
  base: string,
  end?: boolean
): boolean {
  const target = pendingTarget(router);
  return !!target && linkMatcher({ pathname: target.value, search: "" }, base, end)(to).active;
}

/**
 * Opt-in `data-pending` for plain anchors. Marks claimed links whose path
 * covers the in-flight destination of a link click or `navigate()` (not
 * back/forward), until it lands. Agrees with `useLinkState().pending`, which
 * works without it. `aria-current` and `data-active` need no plugin.
 *
 * @example
 * ```ts
 * import { createRouter, pendingLinks } from "@solidjs/router";
 *
 * const Router = createRouter({ routes, links: pendingLinks });
 * // CSS: a[data-pending] { opacity: .6 }
 * ```
 */
export const pendingLinks: LinksPlugin = (router, base) => ({
  track: routingState(router),
  pending: target => linkPending(router, target, base)
});
