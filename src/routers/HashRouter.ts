import type { JSX } from "solid-js";
import { setupNativeEvents } from "../data/events.js";
import type { BaseRouterProps } from "./components.js";
import { createRouter, scrollToHash, bindEvent } from "./createRouter.js";
import { createBeforeLeave, keepDepth, notifyIfNotBlocked, saveCurrentDepth } from "../lifecycle.js";

export function hashParser(str: string) {
  const to = str.replace(/^.*?#/, "");
  // Hash-only hrefs like `#foo` from plain anchors will come in as `/#foo` whereas a link to
  // `/foo` will be `/#/foo`. Check if the to starts with a `/` and if not append it as a hash
  // to the current path so we can handle these in-page anchors correctly.
  if (!to.startsWith("/")) {
    const [, path = "/"] = window.location.hash.split("#", 2);
    return `${path}#${to}`;
  }
  return to;
}

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
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase),
    utils: {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: hashParser,
      beforeLeave
    }
  })(props);
}
