import { isServer } from "solid-js/web";
import { createRouter, scrollToHash, bindEvent } from "./createRouter.js";
import { StaticRouter } from "./StaticRouter.js";
import { setupNativeEvents } from "../data/events.js";
import type { BaseRouterProps } from "./components.jsx";
import type { JSX } from "solid-js";
import { createBeforeLeave, keepDepth, notifyIfNotBlocked, saveCurrentDepth } from "../lifecycle.js";

export type RouterProps = BaseRouterProps & { url?: string, actionBase?: string, explicitLinks?: boolean, preload?: boolean };

export function Router(props: RouterProps): JSX.Element {
  if (isServer) return StaticRouter(props);
  const getSource = () => {
    const url = window.location.pathname.replace(/^\/+/, "/") + window.location.search;
    return {
      value: url + window.location.hash,
      state: window.history.state
    }
  };
  const beforeLeave = createBeforeLeave();
  return createRouter({
    get: getSource,
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "popstate",
        notifyIfNotBlocked(notify, delta => {
          if (delta && delta < 0) {
            return !beforeLeave.confirm(delta);
          } else {
            const s = getSource();
            return !beforeLeave.confirm(s.value, { state: s.state });
          }
        })
      ),
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase, props.transformUrl),
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  })(props);
}
