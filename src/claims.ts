import { registerElementClaim } from "@solidjs/web";
import { createRenderEffect, getOwner, onCleanup, untrack } from "solid-js";
import type { RouterContext } from "./types.js";
import { comparablePath } from "./utils.js";

/**
 * The compiler claims every `a[href]` (and `form[action]`, which this handler
 * ignores) at creation, and the runtime re-claims on `href` writes. This
 * consumer gives each router-managed anchor the link-state vocabulary without
 * a wrapper component:
 *
 * - `aria-current="page"` — the location matches the link exactly
 * - `data-active` — exact or prefix match
 * - `data-pending` — the link is the target of an in-flight navigation
 *
 * Elements are claimed at creation, so late mounts (`<Show>`, `<For>`,
 * portals) are correct immediately. One render effect (owned by the router)
 * subscribes to the location and sweeps a registry of claimed anchors —
 * anchors themselves carry no reactive machinery, just a registry entry
 * removed by their creating owner's cleanup. State is applied once at claim
 * so it is correct before the next navigation; re-claims (an `href` write)
 * are the same one-shot untracked refresh, reading the element's current
 * `href` from the DOM.
 */
export function setupLinkClaims(router: RouterContext, explicitLinks?: boolean) {
  const basePath = router.base.path();
  // per-element record; `current` remembers whether we set `aria-current`,
  // so user-authored values (steppers, breadcrumbs) are never stripped
  const claimed = new WeakMap<Node, { current: boolean }>();
  const registry = new Set<HTMLAnchorElement | SVGAElement>();

  function isSvg<T extends SVGElement>(el: T | HTMLElement): el is T {
    return el.namespaceURI === "http://www.w3.org/2000/svg";
  }

  /** The comparable pathname when the router manages this anchor, else `undefined`. */
  function managedPath(a: HTMLAnchorElement | SVGAElement): string | undefined {
    if (explicitLinks && !a.hasAttribute("link")) return;
    const svg = isSvg(a);
    // claims fire at creation while the element is still in the template's
    // inert fragment, where the `href` property is not resolved — resolve the
    // raw attribute against the live document instead
    const href = svg ? a.href.baseVal : a.getAttribute("href");
    const target = svg ? a.target.baseVal : (a as HTMLAnchorElement).target;
    if (target || !href) return;
    const rel = (a.getAttribute("rel") || "").split(/\s+/);
    if (a.hasAttribute("download") || rel.includes("external")) return;
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return;
    }
    if (
      url.origin !== window.location.origin ||
      (basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase()))
    )
      return;
    return comparablePath(url.pathname);
  }

  function linkState(a: HTMLAnchorElement | SVGAElement) {
    // read reactive sources unconditionally so the owning effect stays
    // subscribed even while the anchor is not router-managed
    const loc = decodeURI(comparablePath(router.location.pathname));
    const routing = router.isRouting();
    const path = managedPath(a);
    // the root path is a prefix of everything, so it only matches exactly —
    // there is no per-anchor `end` opt-out like useLinkState has
    const matches = (target: string) =>
      path !== undefined && (target === path || (path !== "" && target.startsWith(path + "/")));
    // effects observe the committed location during a transition, so the
    // in-flight target comes from pendingTarget — readable here because the
    // isRouting write flushes after the target is assigned
    const pending =
      routing && !!router.pendingTarget && matches(decodeURI(comparablePath(router.pendingTarget.value)));
    return { active: matches(loc), pending, exact: path !== undefined && loc === path };
  }

  function apply(
    a: HTMLAnchorElement | SVGAElement,
    rec: { current: boolean },
    { active, pending, exact }: ReturnType<typeof linkState>
  ) {
    active ? a.setAttribute("data-active", "") : a.removeAttribute("data-active");
    pending ? a.setAttribute("data-pending", "") : a.removeAttribute("data-pending");
    if (exact !== rec.current) {
      exact ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
      rec.current = exact;
    }
  }

  const refresh = (a: HTMLAnchorElement | SVGAElement, rec: { current: boolean }) =>
    untrack(() => apply(a, rec, linkState(a)));

  // The one subscription for every anchor: compute tracks the sources
  // linkState derives from (the in-flight pendingTarget is readable in the
  // effect phase because the isRouting write flushes after the target is
  // assigned), the effect phase sweeps the registry untracked.
  //
  // `transparent` keeps the effect invisible to the hydration id scheme.
  // This setup is client-only, so an id-consuming node here has no server
  // counterpart and every subsequent hydration id would shift by one child
  // slot — lazy-route lookups miss and hydration leaves server nodes
  // unclaimed. (The option is honored by the runtime but missing from the
  // published EffectOptions type, hence the cast.)
  createRenderEffect(
    () => (router.location.pathname, router.isRouting()),
    () => registry.forEach(a => refresh(a, claimed.get(a)!)),
    { transparent: true } as {}
  );

  onCleanup(
    registerElementClaim(node => {
      if (node.nodeName.toUpperCase() !== "A") return;
      const a = node as HTMLAnchorElement | SVGAElement;
      // re-claim (href changed): the claiming write runs inside another
      // effect, so refresh without leaking subscriptions into it
      const existing = claimed.get(a);
      if (existing) return refresh(a, existing);
      const rec = { current: false };
      claimed.set(a, rec);
      // claims fire during component setup, so an owner is present in
      // practice to bound the registry entry's lifetime; without one, state
      // is still applied once at creation
      if (getOwner()) {
        registry.add(a);
        onCleanup(() => registry.delete(a));
      }
      refresh(a, rec);
    })
  );
}
