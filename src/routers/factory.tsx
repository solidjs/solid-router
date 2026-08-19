/*@refresh skip*/

import type { Owner } from "solid-js";
import { createSignal, getOwner, onCleanup, sharedConfig, untrack } from "solid-js";
// standalone import: `DEV` is undefined in solid's production build, so app
// bundlers fold `DEV &&` diagnostics out of shipped bundles
import { DEV } from "solid-js";
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
  RouterContextObj,
  trackLazySubtrees,
  useOptionalContext
} from "../routing.js";
import type {
  Branch,
  DefinedRouteFilters,
  LazyRouteChildren,
  LocationChange,
  OutputMatch,
  Params,
  RouteDefinition,
  RouteInfo,
  RouteParams,
  RoutePreloadFunc,
  RoutePreloadFuncArgs,
  RouterIntegration,
  RouteSectionComponent,
  RouteSectionProps,
  StandardSchemaV1,
  ValidFilters
} from "../types.js";
import { mockBase } from "../utils.js";
import { Root, Routes } from "./components.jsx";
import { browserHistory } from "./history.js";
import type { RouterHistory } from "./history.js";
import { createScrollRestoration, withScrollRestoration } from "./scrollRestoration.js";
import type { ScrollRestoration } from "./scrollRestoration.js";

/**
 * Identity helper that preserves literal types when the route tree is
 * declared as a separate variable. `createRouter` infers literally from
 * inline arrays, but an extracted `const routes = [...]` widens paths to
 * `string` and silently degrades `paths` and the typed hooks unless it is
 * declared `as const` — `defineRoutes` makes that impossible to forget.
 */
export function defineRoutes<const R extends readonly RouteDefinition[]>(routes: R): R {
  return routes;
}

type RouteChildren = RouteDefinition | readonly RouteDefinition[] | LazyRouteChildren;

// The single contextual signature for `component` in `defineRoute`. The
// public `RouteSectionComponent` union can't be used here: TypeScript only
// contextually types a lambda's parameter from a single call signature, and
// the whole point of `defineRoute` is that `props` infers. `children` is
// `any` so `VoidComponent` pages (whose props declare `children?: never`,
// #347) still assign under contravariance.
type DefinedRouteComponent<T, P extends Params> = (
  props: RouteSectionProps<T, P> & { children?: any }
) => JSX.Element;

/**
 * The type `defineRoute` hands back: `path`, `matchFilters`, `children`, and
 * `search` stay literal — and only present when provided precisely, which is
 * what the `paths` machinery keys on — while `component`/`preload` widen back
 * to the plain `RouteDefinition` contract so the route drops into any route
 * tree. Generics that stayed at their fallback (not provided, or deferred by
 * a context-sensitive value inside) are omitted rather than widening the
 * whole route.
 */
export type DefinedRoute<
  S = undefined,
  T = unknown,
  F = undefined,
  C = undefined,
  Sch = undefined
> = ([S] extends [undefined] ? {} : { path: S }) &
  ([F] extends [undefined] ? {} : DefinedRouteFilters<S> extends F ? {} : { matchFilters: F }) &
  ([C] extends [undefined] ? {} : [RouteChildren | undefined] extends [C] ? {} : { children: C }) &
  ([Sch] extends [undefined] ? {} : { search: Sch }) & {
    component?: RouteSectionComponent<T>;
    preload?: RoutePreloadFunc<T>;
    info?: RouteInfo;
  };

/**
 * Identity helper that types a single route from its own `path` pattern:
 * inside `component` and `preload`, `props.params`/`args.params` carry the
 * params the pattern guarantees (`:id` is `string`, `:tab?` is
 * `string | undefined`) instead of the open `Params` record. Params
 * inherited from parent routes remain accessible as `string | undefined`.
 *
 * Purely a definition-site convenience — plain object routes behave
 * identically at runtime, and nested `children` only get typed params if
 * they use `defineRoute` themselves.
 */
export function defineRoute<
  const S extends string | readonly string[],
  T = unknown,
  // Unconstrained with the filter record for `S` as default: a filter object
  // containing an inline lambda is context-sensitive, which defers inference
  // and fixes `F` to its default — the default then still provides
  // `s: string` contextual typing and excess-property checks. Same idea for
  // `C`. Validity of inferred `F` is enforced at the property instead
  // (`F & ValidFilters<F, S>`).
  const F = DefinedRouteFilters<S>,
  const C extends RouteChildren | undefined = RouteChildren | undefined,
  Sch extends StandardSchemaV1<any, any> | undefined = undefined
>(route: {
  path: S;
  matchFilters?: F & ValidFilters<F, S>;
  preload?: (args: RoutePreloadFuncArgs<RouteParams<S>>) => T;
  component?: DefinedRouteComponent<T, RouteParams<S>>;
  children?: C;
  /** Standard Schema validator for this route's search params; its input type flows into the typed path proxy. */
  search?: Sch;
  info?: RouteInfo;
}): DefinedRoute<S, T, F, C, Sch>;
// pathless (layout) route — params stay the open `Params` record
export function defineRoute<
  T = unknown,
  const C extends RouteChildren | undefined = RouteChildren | undefined,
  Sch extends StandardSchemaV1<any, any> | undefined = undefined
>(route: {
  preload?: (args: RoutePreloadFuncArgs) => T;
  component?: DefinedRouteComponent<T, Params>;
  children?: C;
  search?: Sch;
  info?: RouteInfo;
}): DefinedRoute<undefined, T, undefined, C, Sch>;
export function defineRoute(route: RouteDefinition): RouteDefinition {
  return route;
}

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
  /**
   * History adapter for client navigation; defaults to browser history. On
   * the server only its `utils` apply — the location comes from the request
   * event or the provider's `url` prop.
   */
  history?: RouterHistory;
  singleFlight?: boolean;
  actionBase?: string;
  explicitLinks?: boolean;
  /** Preload route code/data on link hover and focus. Defaults to `true`. */
  preloadLinks?: boolean;
  /**
   * Explicit scroll restoration for back/forward navigation: positions are
   * saved per history entry and restored once the navigation settles,
   * replacing the browser heuristic that loses offsets when the destination
   * route forces a layout while rendering. Defaults to `true` with the
   * default browser history; a custom `history` adapter owns its session and
   * must opt in explicitly.
   */
  scrollRestoration?: boolean;
  transformUrl?: (url: string) => string;
}

export interface RouterProps {
  /**
   * Server-only: the location for this render when no request event is in
   * scope (SSG scripts, tests, runtimes without `node:async_hooks`). A
   * request event established by the server harness takes precedence.
   * Ignored on the client, where the history adapter owns the location.
   */
  url?: string;
  children?: (props: RouteSectionProps) => JSX.Element;
}

export interface RouterInstance<R extends readonly RouteDefinition[] = RouteDefinition[]> {
  /** The instance is the provider component; the render-prop child receives the matched content as `props.children`. */
  (props: RouterProps): JSX.Element;
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
 * server render never navigates. The request event (when the harness scopes
 * one) wins; the provider's `url` prop is the fallback for renders outside a
 * request scope (SSG scripts, server-side tests, runtimes without
 * `node:async_hooks`). History adapters are a client navigation concern and
 * play no part in locating a server render.
 */
function staticIntegration(url?: string, utils?: RouterHistory["utils"]): RouterIntegration {
  const e = getRequestEvent();
  const source = e ? e.request.url : url;
  let value = "";
  if (source) {
    const u = new URL(source, mockBase);
    value = u.pathname + u.search;
  }
  const obj: LocationChange = { value };
  return { signal: [() => obj, next => Object.assign(obj, next)], utils };
}

export function createRouter<const R extends readonly RouteDefinition[]>(
  config: RouterConfig<R>
): RouterInstance<R> {
  const basePath = config.base || "";
  // Routes are immutable per instance, so compilation is shared by every
  // mount, request, and `match()` call — recompiled only when a lazy subtree
  // resolves (append-only: resolution, not mutation). Reading the version
  // inside a computation subscribes it; plain calls just see current state.
  let compiled: Branch[] | undefined;
  let compiledVersion = -1;
  const branches = () => {
    const version = trackLazySubtrees();
    if (!compiled || compiledVersion !== version) {
      compiled = createBranches(config.routes as unknown as RouteDefinition[], basePath);
      compiledVersion = version;
    }
    return compiled;
  };
  const renderPath = (config.history && config.history.utils && config.history.utils.renderPath) || undefined;

  function RouterComponent(props: RouterProps): JSX.Element {
    // One router per app: the session (location, history, delegation, link
    // claims, preloading) has a single owner, and a second instance would
    // fight it — stale content on click navigations, conflicting link
    // attributes. Compose route trees instead; lazy subtrees are the planned
    // answer for definitions unknown at build time.
    if (DEV && useOptionalContext(RouterContextObj)) {
      console.warn(
        "Mounting a router inside another router is not supported. " +
          "Compose route trees in one createRouter config instead."
      );
    }
    const root = untrack(() => props.children);
    let restoration: ScrollRestoration | undefined;
    let history = config.history;
    if (!isServer && (config.scrollRestoration ?? !history)) {
      restoration = createScrollRestoration();
      history = withScrollRestoration(history || browserHistory(), restoration);
    }
    const integration = isServer
      ? staticIntegration(props.url, config.history && config.history.utils)
      : createIntegration(history || browserHistory());
    let context: Owner;
    const routerState = createRouterContext(integration, branches, () => context, {
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
      restoration && restoration.create(routerState);
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

  const instance = Object.assign(RouterComponent, {
    routes: config.routes,
    config,
    match(url: string): OutputMatch[] {
      const u = new URL(url, mockBase);
      const pathname = config.transformUrl ? config.transformUrl(u.pathname) : u.pathname;
      return getRouteMatches(branches(), pathname).map(({ route, path, params }) => ({
        path: route.originalPath,
        pattern: route.pattern,
        match: path,
        params,
        info: route.info
      }));
    }
  });
  // Built on first access (a getter via Object.assign would run during the
  // copy) so runtimes without Proxy — some older TVs — can still route as
  // long as they never touch typed paths.
  let paths: RoutePaths<R> | undefined;
  Object.defineProperty(instance, "paths", {
    get: () => paths || (paths = createPathsProxy(renderPath, basePath) as RoutePaths<R>)
  });
  return instance as typeof instance & { readonly paths: RoutePaths<R> };
}
