import { createMemo, DEV, isPending, latest, NotReadyError, runWithOwner } from "solid-js";
import type { LinksPlugin, LocationChange, RouterContext } from "./types.js";
import { matchLink } from "./utils.js";

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
  return !!target && matchLink({ pathname: target.value, search: "" }, to, base, end).active;
}

/**
 * Claims plugin: marks claimed anchors that are the target of the in-flight
 * navigation with `data-pending`, agreeing with `useLinkState().pending`.
 *
 * @example
 * ```ts
 * const Router = createRouter({ routes, links: pendingLinks });
 * ```
 */
export const pendingLinks: LinksPlugin = (router, base) => ({
  track: routingState(router),
  pending: target => linkPending(router, target, base)
});
