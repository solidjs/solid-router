import { delegateEvents, dispatchAsInteraction } from "@solidjs/web";
import { onCleanup } from "solid-js";
import type { LinkPreload, RouterContext } from "../types.js";
import { isUnderBase } from "../utils.js";

/**
 * App bundlers define this (`"true"` when server components are on, including
 * `'external'`, otherwise `"false"`). Not assigned here: the published build
 * keeps the `typeof` check so they can fold the fallback away.
 */
declare const __SOLID_SERVER_COMPONENTS__: boolean | undefined;

/**
 * The submit delegation consults this slot instead of importing the action
 * module: the action side installs its handler on first action creation
 * (see data/action.ts), so an app that never creates an action never pulls
 * the data layer into its bundle through the router's event wiring.
 */
export type RouterFormHandler = (
  evt: SubmitEvent,
  router: RouterContext,
  actionBase: string
) => void;

let formHandler: RouterFormHandler | undefined;

export function setRouterFormHandler(handler: RouterFormHandler | undefined) {
  formHandler = handler;
}

/**
 * Link preload strategies reach route preloading through this slot instead
 * of the event wiring importing it: a strategy installs it when it runs (see
 * preload.ts), so an app with no strategy and no `usePreloadRoute` never
 * ships route preloading.
 */
let linkPreloader: ((router: RouterContext, url: URL, data: boolean) => void) | undefined;

export function setLinkPreloader(preloader: typeof linkPreloader) {
  linkPreloader = preloader;
}

type NativeEventConfig = {
  preload?: LinkPreload | readonly LinkPreload[];
  explicitLinks?: boolean; // defaults false
  actionBase?: string; // defaults "/_server"
};

export function setupNativeEvents({
  preload,
  explicitLinks = false,
  actionBase = "/_server"
}: NativeEventConfig = {}) {
  return (router: RouterContext) => {
    const basePath = router.base.path();
    const navigateFromRoute = router.navigatorFactory(router.base);

    function isSvg<T extends SVGElement>(el: T | HTMLElement): el is T {
      return el.namespaceURI === "http://www.w3.org/2000/svg";
    }

    function handleAnchor(evt: MouseEvent) {
      if (
        evt.defaultPrevented ||
        evt.button !== 0 ||
        evt.metaKey ||
        evt.altKey ||
        evt.ctrlKey ||
        evt.shiftKey
      )
        return;
      return findAnchor(evt);
    }

    // no button or modifier gate: focus and touch events carry neither
    function findAnchor(evt: Event) {
      const a = evt
        .composedPath()
        .find(el => el instanceof Node && el.nodeName.toUpperCase() === "A") as
        | HTMLAnchorElement
        | SVGAElement
        | undefined;
      const url = a && anchorUrl(a);
      return url && ([a, url] as const);
    }

    /** The anchor's URL when the router manages it, else `undefined`. */
    function anchorUrl(a: HTMLAnchorElement | SVGAElement) {
      if (explicitLinks && !a.hasAttribute("link")) return;

      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || (!href && !a.hasAttribute("state"))) return;

      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || rel.includes("external")) return;

      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      // Skip non-http(s) schemes (blob:, mailto:, tel:, data:, ...). blob: URLs
      // inherit the page origin, so the origin check below won't reject them. #382
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      if (url.origin !== window.location.origin || !isUnderBase(url.pathname, basePath)) return;
      return url;
    }

    function handleAnchorClick(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      const to = router.parsePath(url.pathname + url.search + url.hash);
      const state = a.getAttribute("state");

      evt.preventDefault();
      // Only a click the router acts on joins the event's interaction: this
      // listener hears every click on the document.
      dispatchAsInteraction(evt, () =>
        navigateFromRoute(to, {
          resolve: false,
          replace: a.hasAttribute("replace"),
          scroll: !a.hasAttribute("noscroll"),
          state: state ? JSON.parse(state) : undefined
        })
      );
    }

    function handleFormSubmit(evt: SubmitEvent) {
      if (formHandler) return formHandler(evt, router, actionBase);
      // No form handler means no action module in the client graph at all
      // (e.g. server components binding forms straight to server functions).
      // A POST to a url under actionBase is self-describing, so delegation
      // is still sufficient: intercept synchronously — the no-JS treatment
      // is reserved for clients with no JS — capture the FormData, and load
      // the handler lazily. Apps that never submit one never load it.
      if (evt.defaultPrevented) return;
      const form = evt.target as HTMLFormElement;
      const ref =
        evt.submitter && evt.submitter.hasAttribute("formaction")
          ? evt.submitter.getAttribute("formaction")
          : form.getAttribute("action");
      if (!ref || ref.startsWith("https://action/")) return;
      const url = new URL(ref, document.baseURI);
      const path = router.parsePath(url.pathname + url.search);
      if (!path.startsWith(actionBase) || form.method.toUpperCase() !== "POST") return;
      // The import sits inside the check so bundlers drop the server-forms
      // chunk. An early return above a still-present import() does not.
      // Missing stays off: an undefined constant does not fold.
      if (typeof __SOLID_SERVER_COMPONENTS__ !== "undefined" && __SOLID_SERVER_COMPONENTS__) {
        evt.preventDefault();
        const data = new FormData(form, evt.submitter);
        import("./serverForms.js").then(m => m.submitServerForm(router, path, form, data));
      }
    }

    const handleSubmit = (evt: SubmitEvent) =>
      dispatchAsInteraction(evt, () => handleFormSubmit(evt));

    // ensure delegated event run first
    delegateEvents(["click", "submit"]);
    document.addEventListener("click", handleAnchorClick);
    document.addEventListener("submit", handleSubmit);
    onCleanup(() => {
      document.removeEventListener("click", handleAnchorClick);
      document.removeEventListener("submit", handleSubmit);
    });
    // the pre-strategy boolean option is ignored (a dev warning names it)
    if (preload && (preload as unknown) !== true)
      ([] as LinkPreload[]).concat(preload).forEach(strategy =>
        strategy({
          anchor: findAnchor,
          url: anchorUrl,
          preload: (url, data) => linkPreloader!(router, url, data)
        })
      );
  };
}
