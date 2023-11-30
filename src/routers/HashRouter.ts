import type { JSX } from "solid-js";
import { setupNativeEvents } from "../data/events";
import type { BaseRouterProps } from "./components";
import { createRouter, scrollToHash, bindEvent } from "./createRouter";

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

export type HashRouterProps = BaseRouterProps;

export function HashRouter(props: HashRouterProps): JSX.Element {
  return createRouter({
    get: () => window.location.hash.slice(1),
    set({ value, replace, scroll, state }) {
      if (replace) {
        window.history.replaceState(state, "", "#" + value);
      } else {
        window.location.hash = value;
      }
      const hashIndex = value.indexOf("#");
      const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
      scrollToHash(hash, scroll);
    },
    init: notify => bindEvent(window, "hashchange", () => notify()),
    create: setupNativeEvents,
    utils: {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: hashParser
    }
  })(props);
}
