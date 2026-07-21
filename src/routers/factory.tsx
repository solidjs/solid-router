/*@refresh skip*/

import type { Owner } from "solid-js";
import { createSignal, getOwner, onCleanup, sharedConfig, untrack } from "solid-js";
import { getRequestEvent, isServer } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { setupLinkClaims } from "../claims.js";
import { setupNativeEvents } from "../data/events.js";
import { createPathsProxy } from "../paths.js";
import type { RoutePaths } from "../paths.js";
import {
  createBranches,
  createRouterContext,
  getRouteMatches,
  registerFlightRouter,
  RouterContextObj
} from "../routing.js";
import type {
  LocationChange,
  OutputMatch,
  RouteDefinition,
  RoutePreloadFunc,
  RouterIntegration,
  RouteSectionProps
} from "../types.js";
import { mockBase } from "../utils.js";
import { Root, Routes } from "./components.jsx";
import { browserHistory } from "./history.js";
import type { RouterHistory } from "./history.js";

export interface RouterConfig<R extends readonly RouteDefinition[] = RouteDefinition[]> {
  /** The route tree. Immutable per instance — it is the source of truth for matching *and* types. */
  routes: R;
  base?: string;
  /**
   * Runs once per mount/request (and on single-flight collection passes) to
   * warm app-wide data. Its result is passed to the render-prop child as
   * `props.data`.
   */
  preload?: RoutePreloadFunc;
  /** History adapter; defaults to browser history on the client and the request URL on the server. */
  history?: RouterHistory;
  singleFlight?: boolean;
  actionBase?: string;
  explicitLinks?: boolean;
  /** Preload route code/data on link hover and focus. Defaults to `true`. */
  preloadLinks?: boolean;
  transformUrl?: (url: string) => string;
}

export interface RouterInstance<R extends readonly RouteDefinition[] = RouteDefinition[]> {
  /** The instance is the provider component; the render-prop child receives the matched content as `props.children`. */
  (props: { children?: (props: RouteSectionProps) => JSX.Element }): JSX.Element;
  /** Typed path proxy — builds URLs through property access and calls. */
  readonly paths: RoutePaths<R>;
  readonly routes: R;
  /** The config the instance was created with — lets server integrations (flight collector, no-JS handler) consume the instance directly. */
  readonly config: RouterConfig<R>;
  /** Pure matching against an arbitrary URL — no rendering or request context involved. Root→leaf; `[]` when nothing matches. */
  match(url: string): OutputMatch[];
}

/** Wraps a history adapter in the integration signal the router core consumes. Must run under a reactive owner. */
function createIntegration(history: RouterHistory): RouterIntegration {
  let ignore = false;
  const wrap = (value: string | LocationChange) => (typeof value === "string" ? { value } : value);
  const [read, write] = createSignal(wrap(history.get()), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
    ownedWrite: true
  });
  const signal: RouterIntegration["signal"] = [
    read,
    (next: LocationChange) => {
      !ignore && history.set(next);
      if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
      write(next);
    }
  ];

  history.init &&
    onCleanup(
      history.init((value = history.get()) => {
        ignore = true;
        signal[1](wrap(value));
        ignore = false;
      })
    );

  return { signal, utils: history.utils };
}

/**
 * Server default: a static view of the request URL — no signal machinery, a
 * server render never navigates. Without a request event (SSG scripts,
 * server-side tests) the configured history adapter provides the location,
 * so e.g. `memoryHistory("/page")` works isomorphically.
 */
function staticIntegration(history?: RouterHistory): RouterIntegration {
  const e = getRequestEvent();
  let value: string | LocationChange = "";
  if (e) {
    const url = new URL(e.request.url);
    value = url.pathname + url.search;
  } else if (history) {
    value = history.get();
  }
  const obj: LocationChange = typeof value === "string" ? { value } : { ...value };
  return { signal: [() => obj, next => Object.assign(obj, next)], utils: history && history.utils };
}

export function createRouter<const R extends readonly RouteDefinition[]>(
  config: RouterConfig<R>
): RouterInstance<R> {
  const basePath = config.base || "";
  // Routes are immutable per instance, so matching compiles once at factory
  // time and is shared by every mount, request, and `match()` call.
  const branches = createBranches(config.routes as unknown as RouteDefinition[], basePath);
  const renderPath = (config.history && config.history.utils && config.history.utils.renderPath) || undefined;

  function RouterComponent(props: { children?: (props: RouteSectionProps) => JSX.Element }): JSX.Element {
    const root = untrack(() => props.children);
    const integration = isServer
      ? staticIntegration(config.history)
      : createIntegration(config.history || browserHistory());
    let context: Owner;
    const routerState = createRouterContext(integration, () => branches, () => context, {
      base: basePath,
      singleFlight: config.singleFlight,
      transformUrl: config.transformUrl
    });
    if (!isServer) {
      setupNativeEvents({
        preload: config.preloadLinks,
        explicitLinks: config.explicitLinks,
        actionBase: config.actionBase,
        transformUrl: config.transformUrl
      })(routerState);
      setupLinkClaims(routerState, config.explicitLinks);
      if (routerState.singleFlight) onCleanup(registerFlightRouter(routerState));
    }
    return (
      <RouterContextObj value={routerState}>
        <Root routerState={routerState} root={root} preload={config.preload}>
          {(context = getOwner()!) && null}
          <Routes routerState={routerState} branches={branches} />
        </Root>
      </RouterContextObj>
    );
  }

  return Object.assign(RouterComponent, {
    paths: createPathsProxy(renderPath, basePath) as RoutePaths<R>,
    routes: config.routes,
    config,
    match(url: string): OutputMatch[] {
      const u = new URL(url, mockBase);
      const pathname = config.transformUrl ? config.transformUrl(u.pathname) : u.pathname;
      return getRouteMatches(branches, pathname).map(({ route, path, params }) => ({
        path: route.originalPath,
        pattern: route.pattern,
        match: path,
        params,
        info: route.info
      }));
    }
  });
}
