import { isServer } from "solid-js/web";
import { createRouter, scrollToHash, bindEvent } from "./createRouter.js";
import { StaticRouter } from "./StaticRouter.js";
import { setupNativeEvents } from "../data/events.js";
import type { BaseRouterProps } from "./components.jsx";
import type { JSX } from "solid-js";
import { createBeforeLeave, keepDepth, notifyIfNotBlocked, saveCurrentDepth } from "../lifecycle.js";
import { createScrollRestoration } from "./scrollRestoration.js";

export type RouterProps = BaseRouterProps & {
  url?: string,
  actionBase?: string,
  explicitLinks?: boolean,
  preload?: boolean,
  /**
   * Opt-in explicit scroll restoration for back/forward navigation (read
   * once, not reactive). Sets `history.scrollRestoration = "manual"` and
   * restores saved positions after the navigation settles, replacing the
   * browser heuristic that loses offsets when the destination route forces
   * a layout while rendering (#577).
   */
  scrollRestoration?: boolean
};

export function Router(props: RouterProps): JSX.Element {
  if (isServer) return StaticRouter(props);
  const restoration = props.scrollRestoration ? createScrollRestoration() : undefined;
  const getSource = () => {
    const url = window.location.pathname + window.location.search;
    const state = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? undefined : window.history.state;
    return {
      value: url + window.location.hash,
      state
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
      restoration && !replace && restoration.onPush();
    },
    init: notify => {
      const handler = notifyIfNotBlocked(notify, delta => {
        if (delta) {
          return !beforeLeave.confirm(delta);
        } else {
          const s = getSource();
          return !beforeLeave.confirm(s.value, { state: s.state });
        }
      });
      return bindEvent(window, "popstate", restoration
        ? () => {
            restoration.onPop();
            handler();
          }
        : handler);
    },
    create: router => {
      setupNativeEvents({ preload: props.preload, explicitLinks: props.explicitLinks, actionBase: props.actionBase, transformUrl: props.transformUrl })(router);
      restoration && restoration.create(router);
    },
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  })(props);
}
