import { isServer } from "solid-js/web";
import { createRouter, scrollToHash, bindEvent } from "./createRouter";
import { StaticRouter } from "./StaticRouter";
import { setupNativeEvents } from "../data/events";
import type { RouterProps } from "./components";
import type { JSX } from "solid-js";

export function Router(props: RouterProps & { url?: string }): JSX.Element {
  if (isServer) return StaticRouter(props);
  return createRouter({
    get: () => ({
      value: window.location.pathname + window.location.search + window.location.hash,
      state: history.state
    }),
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(state, "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(window.location.hash.slice(1), scroll);
    },
    init: notify => bindEvent(window, "popstate", () => notify()),
    create: setupNativeEvents,
    utils: {
      go: delta => window.history.go(delta)
    }
  })(props);
}
