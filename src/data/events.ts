import { delegateEvents } from "@solidjs/web";
import { onCleanup } from "solid-js";
import type { RouterContext } from "../types.js";

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

type NativeEventConfig = {
  preload?: boolean; // defaults `true`
  explicitLinks?: boolean; // defaults false
  actionBase?: string; // defaults "/_server"
  transformUrl?: (url: string) => string;
};

export function setupNativeEvents({
  preload = true,
  explicitLinks = false,
  actionBase = "/_server",
  transformUrl
}: NativeEventConfig = {}) {
  return (router: RouterContext) => {
    const basePath = router.base.path();
    const navigateFromRoute = router.navigatorFactory(router.base);
    let preloadTimeout: string;
    let lastElement: Node | null;

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

      const a = evt
        .composedPath()
        .find(el => el instanceof Node && el.nodeName.toUpperCase() === "A") as
        | HTMLAnchorElement
        | SVGAElement
        | undefined;

      if (!a || (explicitLinks && !a.hasAttribute("link"))) return;

      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || (!href && !a.hasAttribute("state"))) return;

      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || (rel && rel.includes("external"))) return;

      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      if (
        url.origin !== window.location.origin ||
        (basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase()))
      )
        return;
      return [a, url] as const;
    }

    function handleAnchorClick(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      const to = router.parsePath(url.pathname + url.search + url.hash);
      const state = a.getAttribute("state");

      evt.preventDefault();
      navigateFromRoute(to, {
        resolve: false,
        replace: a.hasAttribute("replace"),
        scroll: !a.hasAttribute("noscroll"),
        state: state ? JSON.parse(state) : undefined
      });
    }

    function handleAnchorPreload(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      router.preloadRoute(url, a.getAttribute("preload") !== "false");
    }

    function handleAnchorMove(evt: Event) {
      clearTimeout(preloadTimeout);
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return (lastElement = null);
      const [a, url] = res;
      if (lastElement === a) return;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      preloadTimeout = setTimeout(() => {
        router.preloadRoute(url, a.getAttribute("preload") !== "false");
        lastElement = a;
      }, 20) as any;
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
      evt.preventDefault();
      const data = new FormData(form, evt.submitter);
      import("./serverForms.js").then(m => m.submitServerForm(router, path, form, data));
    }

    // ensure delegated event run first
    delegateEvents(["click", "submit"]);
    document.addEventListener("click", handleAnchorClick);
    if (preload) {
      document.addEventListener("mousemove", handleAnchorMove, { passive: true });
      document.addEventListener("focusin", handleAnchorPreload, { passive: true });
      document.addEventListener("touchstart", handleAnchorPreload, { passive: true });
    }
    document.addEventListener("submit", handleFormSubmit);
    onCleanup(() => {
      document.removeEventListener("click", handleAnchorClick);
      if (preload) {
        document.removeEventListener("mousemove", handleAnchorMove);
        document.removeEventListener("focusin", handleAnchorPreload);
        document.removeEventListener("touchstart", handleAnchorPreload);
      }
      document.removeEventListener("submit", handleFormSubmit);
    });
  };
}
