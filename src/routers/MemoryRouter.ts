import { createRouter, scrollToHash } from "./createRouter.js";
import { setupNativeEvents } from "../data/events.js";
import type { LocationChange } from "../types.js";
import type { BaseRouterProps } from "./components.jsx";
import type { JSX } from "solid-js";

export type MemoryHistory = {
  get: () => string;
  set: (change: LocationChange) => void;
  go: (delta: number) => void;
  listen: (listener: (value: string) => void) => () => void;
};

export function createMemoryHistory() {
  const entries = ["/"];
  let index = 0;
  const listeners: ((value: string) => void)[] = [];

  const go = (n: number) => {
    // https://github.com/remix-run/react-router/blob/682810ca929d0e3c64a76f8d6e465196b7a2ac58/packages/router/history.ts#L245
    index = Math.max(0, Math.min(index + n, entries.length - 1));

    const value = entries[index];
    listeners.forEach(listener => listener(value));
  };

  return {
    get: () => entries[index],
    set: ({ value, scroll, replace }: LocationChange) => {
      if (replace) {
        entries[index] = value;
      } else {
        entries.splice(index + 1, entries.length - index, value);
        index++;
      }

      listeners.forEach(listener => listener(value));

      setTimeout(() => {
        if (scroll) {
          scrollToHash(value.split("#")[1] || "", true);
        }
      }, 0);
    },
    back: () => {
      go(-1);
    },
    forward: () => {
      go(1);
    },
    go,
    listen: (listener: (value: string) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        listeners.splice(index, 1);
      };
    }
  };
}

export type MemoryRouterProps = BaseRouterProps & { history?: MemoryHistory, actionBase?: string, explicitLinks?: boolean, preload?: boolean };

export function MemoryRouter(props: MemoryRouterProps): JSX.Element {
  const memoryHistory = props.history || createMemoryHistory();

  return createRouter({
    get: memoryHistory.get,
    set: memoryHistory.set,
    init: memoryHistory.listen,
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase),
    utils: {
      go: memoryHistory.go
    }
  })(props);
}
