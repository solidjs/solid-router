import { registerElementClaim } from "@solidjs/web";
import { createRenderEffect, getOwner, onCleanup, untrack } from "solid-js";
import type { LinksPlugin, RouterContext } from "./types.js";
import { isUnderBase, matchLink } from "./utils.js";

/**
 * Claimed forms are handed to this slot instead of the claims importing the
 * action module: the action side installs it on first action creation (see
 * data/action.ts), where form `aria-busy` state lives, so an app that never
 * creates an action never pulls the data layer in through its claims.
 */
let formClaim: ((form: HTMLFormElement) => void) | undefined;

export function setFormClaimHandler(handler: ((form: HTMLFormElement) => void) | undefined) {
  formClaim = handler;
}

/**
 * The compiler claims every `a[href]` and `form[action]` at creation, and the
 * runtime re-claims on `href`/`action` writes and after a server-component
 * morph changes the element. Forms go to the action layer's slot above, which
 * re-applies `aria-busy` while their action is in flight. This consumer gives each router-managed anchor the link-state
 * vocabulary without a wrapper component:
 *
 * - `aria-current="page"` — the location matches the link exactly, query
 *   included (parameter order aside)
 * - `data-active` — pathname exact or prefix match (the router's root, its
 *   base path, exact only)
 * - `data-pending` — the link is the target of an in-flight navigation;
 *   opt-in through `createRouter({ links: pendingLinks })`. Without the
 *   plugin, claims never read pending state and the sweep does not track it.
 *
 * The matching rule is `matchLink`, shared with `useLinkState`. The router
 * only touches an `aria-current` it wrote itself: one the author set (a
 * stepper's `"step"`, a static `"page"`) is left in place, current or not.
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
export function setupLinkClaims(
  router: RouterContext,
  explicitLinks?: boolean,
  links?: LinksPlugin
) {
  const basePath = router.base.path();
  const plugin = links && links(router, basePath);
  // per-element record; `owned` is whether the `aria-current` on the element
  // is the router's, so it never writes over or removes an authored one
  const claimed = new WeakMap<Node, { owned: boolean }>();
  const registry = new Set<HTMLAnchorElement | SVGAElement>();

  function isSvg<T extends SVGElement>(el: T | HTMLElement): el is T {
    return el.namespaceURI === "http://www.w3.org/2000/svg";
  }

  /** The anchor's resolved URL when the router manages it, else `undefined`. */
  function managedUrl(a: HTMLAnchorElement | SVGAElement): URL | undefined {
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
    if (url.origin !== window.location.origin || !isUnderBase(url.pathname, basePath)) return;
    return url;
  }

  function linkState(a: HTMLAnchorElement | SVGAElement) {
    // read reactive sources unconditionally so the owning effect stays
    // subscribed even while the anchor is not router-managed
    const location = router.location;
    const routing = plugin && plugin.track();
    const url = managedUrl(a);
    const target = url && url.pathname + url.search;
    // no per-anchor `end` opt-out like useLinkState has
    const { active, current } = matchLink(location, target, basePath);
    const pending = !!routing && plugin!.pending(target);
    return { active, pending, current };
  }

  function apply(
    a: HTMLAnchorElement | SVGAElement,
    rec: { owned: boolean },
    { active, pending, current }: ReturnType<typeof linkState>
  ) {
    active ? a.setAttribute("data-active", "") : a.removeAttribute("data-active");
    if (plugin) pending ? a.setAttribute("data-pending", "") : a.removeAttribute("data-pending");
    // Ownership is read against the element, not just the record. A
    // server-component morph resets attributes to the server HTML, which
    // never carries router link state, then re-claims: an owned value that
    // went missing is re-applied, while a value the morph restored from the
    // server HTML (or the author wrote since) is authored and left alone.
    const value = a.getAttribute("aria-current");
    if (rec.owned && value !== null && value !== "page") rec.owned = false;
    else if (current) {
      if (value === null) {
        a.setAttribute("aria-current", "page");
        rec.owned = true;
      }
    } else if (rec.owned) {
      if (value !== null) a.removeAttribute("aria-current");
      rec.owned = false;
    }
  }

  const refresh = (a: HTMLAnchorElement | SVGAElement, rec: { owned: boolean }) =>
    untrack(() => apply(a, rec, linkState(a)));

  // The one subscription for every anchor: compute tracks the sources
  // linkState derives from (with the plugin, its pending read — the
  // in-flight target is readable in the effect phase because the isRouting
  // write flushes after the target is assigned), the effect phase sweeps the
  // registry untracked.
  //
  // `transparent` keeps the effect invisible to the hydration id scheme.
  // This setup is client-only, so an id-consuming node here has no server
  // counterpart and every subsequent hydration id would shift by one child
  // slot — lazy-route lookups miss and hydration leaves server nodes
  // unclaimed. (The option is honored by the runtime but missing from the
  // published EffectOptions type, hence the cast.)
  createRenderEffect(
    () => (router.location.pathname, router.location.search, plugin && plugin.track()),
    () => registry.forEach(a => refresh(a, claimed.get(a)!)),
    { transparent: true } as {}
  );

  onCleanup(
    registerElementClaim(node => {
      const name = node.nodeName.toUpperCase();
      if (name === "FORM") return formClaim && formClaim(node as HTMLFormElement);
      if (name !== "A") return;
      const a = node as HTMLAnchorElement | SVGAElement;
      // re-claim (href changed): the claiming write runs inside another
      // effect, so refresh without leaking subscriptions into it
      const existing = claimed.get(a);
      if (existing) return refresh(a, existing);
      const rec = { owned: false };
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
