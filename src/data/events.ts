import { delegateEvents } from "solid-js/web";
import { onCleanup } from "solid-js";
import type { RouterContext } from "../types.js";
import { actions } from "./action.js";
import { mockBase } from "../utils.js";

export function setupNativeEvents(
  preload = true,
  explicitLinks = false,
  actionBase = "/_server",
  transformUrl?: (url: string) => string
) {
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
      clearTimeout(preloadTimeout)
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return lastElement = null;
      const [a, url] = res;
      if (lastElement === a) return;
      transformUrl && (url.pathname = transformUrl(url.pathname));
      preloadTimeout = setTimeout(() => {
        router.preloadRoute(url, a.getAttribute("preload") !== "false");
        lastElement = a;
      }, 20) as any;
    }

    function handleFormSubmit(evt: SubmitEvent) {
      if (evt.defaultPrevented) return;
      let actionRef =
        evt.submitter && evt.submitter.hasAttribute("formaction")
          ? evt.submitter.getAttribute("formaction")
          : (evt.target as HTMLElement).getAttribute("action");
      if (!actionRef) return;
      if (!actionRef.startsWith("https://action/")) {
        // normalize server actions
        const url = new URL(actionRef, mockBase);
        actionRef = router.parsePath(url.pathname + url.search);
        if (!actionRef.startsWith(actionBase)) return;
      }
      if ((evt.target as HTMLFormElement).method.toUpperCase() !== "POST")
        throw new Error("Only POST forms are supported for Actions");
      const handler = actions.get(actionRef);
      if (handler) {
        evt.preventDefault();
        const data = new FormData(evt.target as HTMLFormElement, evt.submitter);
        handler.call(
          { r: router, f: evt.target },
          (evt.target as HTMLFormElement).enctype === "multipart/form-data"
            ? data
            : new URLSearchParams(data as any)
        );
      }
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
