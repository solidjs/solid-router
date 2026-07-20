import type { JSX } from "@solidjs/web";
import { setupNativeEvents } from "../data/events.js";
import type { BaseRouterProps } from "./components.jsx";
import { createRouter, scrollToHash, bindEvent } from "./createRouter.js";
import { createBeforeLeave, keepDepth, notifyIfNotBlocked, saveCurrentDepth } from "../lifecycle.js";

export { hashParser } from "./history.js";
import { hashParser } from "./history.js";

export type HashRouterProps = BaseRouterProps & { actionBase?: string, explicitLinks?: boolean, preload?: boolean };

export function HashRouter(props: HashRouterProps): JSX.Element {
  const getSource = () => window.location.hash.slice(1);
  const beforeLeave = createBeforeLeave();
  return createRouter({
    get: getSource,
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", "#" + value);
      } else {
        window.history.pushState(state, "", "#" + value);
      }
      const hashIndex = value.indexOf("#");
      const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
      scrollToHash(hash, scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "hashchange",
        notifyIfNotBlocked(
          notify,
          delta => !beforeLeave.confirm(delta && delta < 0 ? delta : getSource())
        )
      ),
    create: setupNativeEvents({ preload: props.preload, explicitLinks: props.explicitLinks, actionBase: props.actionBase }),
    utils: {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: hashParser,
      beforeLeave
    }
  })(props);
}
