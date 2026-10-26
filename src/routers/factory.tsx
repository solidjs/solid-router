/*@refresh skip*/

import type { Owner } from "solid-js";
import {
  createSignal,
  flush,
  getOwner,
  isHydrating,
  onCleanup,
  onSettled,
  runWithOwner,
  untrack
} from "solid-js";
// standalone imports: `DEV` is undefined in solid's production build and
// `OBSERVE` outside its observe/dev builds, so app bundlers fold the
// `DEV &&` diagnostics and the `OBSERVE &&` attribution out of shipped bundles
import { DEV, OBSERVE } from "solid-js";
import type { NavigationRef } from "solid-js";
import { getRequestEvent, isServer } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { setupLinkClaims, setupServerLinkClaims } from "../claims.js";
import { setupNativeEvents } from "../data/events.js";
import { setupFlightDataConsumer } from "../data/query.js";
import { createPathsProxy, HREF } from "../paths.js";
import type { RoutePaths } from "../paths.js";
import { serverRouteOf } from "../serverRouteShared.js";
import {
  createBranches,
  createRouterContext,
  getRouteMatches,
  mergeParams,
  resolveLocationWrite,
  RouterContextObj,
  trackLazySubtrees,
  useOptionalContext
} from "../routing.js";
import type {
  Branch,
  DefinedRouteFilters,
  LazyRouteChildren,
  LinkPreload,
  LinksPlugin,
  LocationChange,
  LocationWrite,
  OutputMatch,
  Params,
  RouteDefinition,
  RouteMatch,
  RouteInfo,
  RouteParams,
  RoutePreloadFunc,
  RoutePreloadFuncArgs,
  RouterIntegration,
  RouteSectionComponent,
  RouteSectionProps,
  StandardSchemaV1,
  TypedPath,
  ValidFilters,
  ViewTransitionOptions
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
    component?: RouteSectionComponent<T> | undefined;
    preload?: RoutePreloadFunc<T> | undefined;
    info?: RouteInfo | undefined;
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
  matchFilters?: (F & ValidFilters<F, S>) | undefined;
  preload?: ((args: RoutePreloadFuncArgs<RouteParams<S>>) => T) | undefined;
  component?: DefinedRouteComponent<T, RouteParams<S>> | undefined;
  children?: C;
  /** Standard Schema validator for this route's search params; its input type flows into the typed path proxy. */
  search?: Sch;
  info?: RouteInfo | undefined;
}): DefinedRoute<S, T, F, C, Sch>;
// pathless (layout) route — params stay the open `Params` record
export function defineRoute<
  T = unknown,
  const C extends RouteChildren | undefined = RouteChildren | undefined,
  Sch extends StandardSchemaV1<any, any> | undefined = undefined
>(route: {
  preload?: ((args: RoutePreloadFuncArgs) => T) | undefined;
  component?: DefinedRouteComponent<T, Params> | undefined;
  children?: C;
  search?: Sch;
  info?: RouteInfo | undefined;
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
  /**
   * Link claims plugin. `aria-current` and `data-active` are automatic; pass
   * `pendingLinks` to also mark links covering the in-flight destination of a
   * link click or `navigate()` with `data-pending`. Client-only.
   *
   * @example
   * ```ts
   * import { createRouter, pendingLinks } from "@solidjs/router";
   *
   * const Router = createRouter({ routes, links: pendingLinks });
   * ```
   */
  links?: LinksPlugin;
  /**
   * Link preload strategies: when to warm a link's route code and data ahead
   * of the click. None by default. Client-only.
   *
   * @example
   * ```ts
   * import { createRouter, intentPreload } from "@solidjs/router";
   *
   * const Router = createRouter({ routes, preloadLinks: intentPreload() });
   * ```
   */
  preloadLinks?: LinkPreload | readonly LinkPreload[];
  /**
   * Explicit scroll restoration for back/forward navigation: positions are
   * saved per history entry and restored once the navigation settles,
   * replacing the browser heuristic that loses offsets when the destination
   * route forces a layout while rendering. Reloads of a server-rendered page
   * are left to the browser's native restoration, which waits for the
   * streamed document to finish loading. Defaults to `true` with the
   * default browser history; a custom `history` adapter owns its session and
   * must opt in explicitly.
   */
  scrollRestoration?: boolean;
  /**
   * Snapshot client navigations with the View Transitions API. The browser
   * captures the current page, then the revealing flush — new route, history
   * write, scroll restoration — runs inside the update callback, and the
   * callback stays open until that navigation settles. Async data keeps the
   * old pixels up until the reveal. Off by default. A per-navigation
   * `navigate(to, { viewTransition })` or a `viewtransition` /
   * `noviewtransition` attribute on an anchor overrides it.
   *
   * Same-tick navigations share one transition and land on the last target.
   * Browsers without `document.startViewTransition`, and
   * `prefers-reduced-motion: reduce`, commit the same way without a snapshot.
   */
  viewTransition?: boolean | ViewTransitionOptions;
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
  /**
   * The query keys of the server component routes a URL shows, root→leaf —
   * what to name in `reload`/`respond`/`redirect`'s `revalidate` (or the
   * client's `revalidate()`) to refetch those routes and nothing else. Route
   * keys, not addresses: the app's `query` key for a hand-written route, the
   * file for a file-system route. Pure matching, so it works in a server
   * action; a `paths` node is accepted.
   */
  keysFor(url: string | TypedPath): string[];
}

/**
 * What one location write is, for solid's observe tier: the parametrized
 * route it heads to, the params, where it came from, and — when the write is
 * the router chasing a redirect while the previous target is still pending —
 * which hop of that navigation it is. The engine times the navigation from
 * this declaration (or from the user event enclosing it) until its writes
 * are through, and names holds and re-runs after it.
 *
 * `name` and `params` are getters: the engine reads them when the navigation
 * settles, not when it starts, so a lazy route subtree that loaded during the
 * hold names the exact route it resolved to rather than its placeholder.
 * Redirect depth comes from `_navigation` (1 = a navigation, n = its
 * (n - 1)th redirect hop, -1 = the browser moved: back/forward, hash).
 */
function describeNavigation(
  match: (pathname: string) => RouteMatch[],
  next: LocationWrite,
  written: () => LocationChange | undefined,
  from: string
): NavigationRef {
  // A composed destination (`LocationWrite.value` a function) is only known
  // once the write has resolved it; the engine re-reads `to` at settle, as it
  // does `name` and `params`. A plain one is known up front.
  const to = () => {
    const w = written();
    return w ? w.value : typeof next.value === "string" ? next.value : undefined;
  };
  const pathname = () => {
    const t = to();
    return t === undefined ? undefined : new URL(t, mockBase).pathname;
  };
  const ref: NavigationRef = {
    kind: "navigation",
    get to() {
      return to();
    },
    from,
    get name() {
      return routeName(match, pathname());
    },
    get params() {
      return routeParams(match, pathname());
    }
  };
  if (next._navigation !== undefined && next._navigation > 1) ref.redirect = next._navigation - 1;
  return ref;
}

/** The parametrized route `pathname` matches — the last match's pattern, `/` for the root; the pathname itself when nothing matched. */
function routeName(
  match: (pathname: string) => RouteMatch[],
  pathname: string | undefined
): string | undefined {
  if (pathname === undefined) return undefined;
  const m = untrack(() => match(pathname));
  return m.length ? m[m.length - 1].route.pattern || "/" : pathname;
}

/** The params the matched chain bound, merged; `undefined` when nothing matched. */
function routeParams(
  match: (pathname: string) => RouteMatch[],
  pathname: string | undefined
): Readonly<Record<string, string>> | undefined {
  if (pathname === undefined) return undefined;
  const m = untrack(() => match(pathname));
  return m.length ? (mergeParams(m) as Readonly<Record<string, string>>) : undefined;
}

/**
 * The route the document arrived on, for solid's observe tier: the same
 * declaration as a navigation's, around the work that establishes the
 * router's initial match — building its context — since a fresh document has
 * no location write to wrap. On the client the engine opens it at the time
 * origin and settles it as the context is built (the first `"navigation"`
 * record, `initial: true`); on the server the same call names the request's
 * `"render"` record (`RenderEvent.route`). Every field is a getter read at
 * settle, as for a navigation: `to` is the location as the router then holds
 * it — the arrival normalized onto the base path when it came in empty, a
 * write the frame itself took (see the setter) — and `name`/`params` match
 * it then, so a lazy subtree that resolved while the server rendered names
 * the exact route.
 */
function describeInitial(
  match: (pathname: string) => RouteMatch[],
  location: () => LocationChange
): NavigationRef {
  const to = () => untrack(location).value;
  const pathname = () => new URL(to(), mockBase).pathname;
  return {
    kind: "navigation",
    initial: true,
    get to() {
      return to();
    },
    get name() {
      return routeName(match, pathname());
    },
    get params() {
      return routeParams(match, pathname());
    }
  };
}

type StartViewTransition = {
  (update: () => void | Promise<void>): unknown;
  (options: { update: () => void | Promise<void>; types?: string[] }): unknown;
};

function startViewTransitionOf(): StartViewTransition | undefined {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  return typeof start === "function" ? start.bind(document) : undefined;
}

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function supportsTransitionTypes() {
  return typeof CSS !== "undefined" && CSS.supports("selector(:active-view-transition-type(a))");
}

/** Drop the navigation-only override so it never becomes stored location state. */
function locationWrite(next: LocationWrite): LocationWrite {
  if (next.viewTransition === undefined) return next;
  const { viewTransition: _viewTransition, ...rest } = next;
  return rest;
}

function requestsTransition(
  config: boolean | ViewTransitionOptions | undefined,
  next: LocationWrite
) {
  if (next.viewTransition === false) return false;
  if (next.viewTransition) return true;
  return !!config;
}

/**
 * Active types for the last write in a same-tick batch, or `false` when that
 * write declines the snapshot. Composers run once here and again when the
 * write lands; they are pure (search params build a string from `headed`).
 */
function transitionTypes(
  config: boolean | ViewTransitionOptions | undefined,
  writes: LocationWrite[],
  from: LocationChange
): string[] | false {
  const last = writes[writes.length - 1];
  const override = last.viewTransition;
  if (override === false) return false;
  if (override && override.types) return override.types;
  if (override) return [];
  if (!config || config === true) return [];
  if (typeof config.types === "function") {
    let headed = from;
    let to = from.value;
    try {
      for (const next of writes) {
        const resolved = resolveLocationWrite(headed, locationWrite(next));
        if (resolved) {
          headed = resolved;
          to = resolved.value;
        }
      }
    } catch {
      to = from.value;
    }
    const decided = config.types({ from: from.value, to });
    return decided === false ? false : (decided ?? []);
  }
  return config.types ?? [];
}

/** Wraps a history adapter in the integration signal the router core consumes. Must run under a reactive owner. */
function createIntegration(
  history: RouterHistory,
  match: (pathname: string) => RouteMatch[],
  options?: {
    viewTransition?: boolean | ViewTransitionOptions;
    /** Bind scroll restoration to the write that is about to commit. */
    prepare?: () => void;
  }
): RouterIntegration {
  let committing = false;
  // Writes whose transition has landed (see `RouterIntegration.settled`).
  const settled = new WeakSet<LocationChange>();
  const wrap = (value: string | LocationChange) => (typeof value === "string" ? { value } : value);
  const [read, write] = createSignal(wrap(history.get()), {
    equals: (a, b) => a.value === b.value && a.state === b.state && a._navigation === b._navigation,
    ownedWrite: true,
    ...(DEV && { name: "router.location" })
  });
  // Same-tick navigations share one snapshot. `open` covers the update
  // callback and the settle it is still waiting on, so a redirect hop joins
  // that transition instead of starting another (which would skip the first
  // and push a second history entry).
  let batch: LocationWrite[] | null = null;
  let inUpdate = false;
  let open = false;

  const runCommit = (next: LocationWrite): Promise<void> | void => {
    // What the write resolved to, or undefined when there was nothing to
    // write (see `resolveLocationWrite`).
    let written: LocationChange | undefined;
    let pending: Promise<void> | undefined;
    const commit = () => {
      options?.prepare?.();
      const bare = locationWrite(next);
      // The functional updater is the one channel that serves an unflushed
      // write of this same tick (A28): the destination composes on it and
      // the no-op rule compares against it, so `navigate()` behind another
      // write in one handler sees that write rather than the flushed world.
      write(headed => (written = resolveLocationWrite(headed, bare)) || headed);
      if (written && written._navigation) {
        const landed = written;
        let resolve!: () => void;
        const done = new Promise<void>(r => {
          resolve = r;
        });
        // Register out of band so a destination error boundary replacing the
        // Router subtree cannot suppress the winning history commit. The
        // settle is tied to the transition carrying the write: it fires when
        // that lands, a rejection included, and a superseded write's settle
        // fires with the transition that absorbed it.
        runWithOwner(null, () =>
          onSettled(() => {
            settled.add(landed);
            try {
              if (landed._navigation! < 0 || read() !== landed) return;
              committing = true;
              try {
                history.set(landed);
              } finally {
                committing = false;
              }
            } finally {
              resolve();
            }
          })
        );
        pending = done;
      }
    };
    // Every client location write passes here — navigate(), a redirect hop,
    // the browser's own back/forward — so this is the one place the
    // navigation is declared. `read()` still holds the committed location
    // while a navigation is pending, which is the `from` a hop wants too.
    // A write the no-op rule drops is still declared: the engine settles a
    // navigation whose write "did not survive the equality gate" on the spot.
    // A write from NO location is not a navigation: it is the arrival being
    // normalized (`createRouterContext` moving an empty location — a hash
    // history with no hash, a memory history seeded with "" — onto the base
    // path), and the arrival is already declared by the initial frame open
    // around the context build (`describeInitial`), which this write then
    // stamps. The location is never empty again after that first write.
    const from = untrack(read).value;
    OBSERVE && from
      ? OBSERVE.attribution.withOrigin(
          describeNavigation(match, locationWrite(next), () => written, from),
          commit
        )
      : commit();
    return pending;
  };

  const signal: RouterIntegration["signal"] = [
    read,
    (next: LocationWrite) => {
      // A hop while the snapshot's update is in flight belongs to it.
      if (inUpdate || open) {
        void runCommit(next);
        return;
      }
      // A second navigate() before the shared snapshot is taken lands in the
      // same batch. Last write wins, one history entry.
      if (batch) {
        batch.push(next);
        return;
      }
      const from = untrack(read).value;
      if (!from || !requestsTransition(options?.viewTransition, next)) {
        void runCommit(next);
        return;
      }
      batch = [next];
      queueMicrotask(() => {
        const writes = batch;
        batch = null;
        if (!writes || !writes.length) return;
        const headed = untrack(read);
        const types = transitionTypes(options?.viewTransition, writes, headed);
        const apply = () => {
          // Arm scroll restoration before the flush, so the restore is this
          // write's settle and not the popstate turn's (that turn is what
          // the browser snapshots).
          options?.prepare?.();
          inUpdate = true;
          open = true;
          try {
            let pending: Promise<void> | undefined;
            flush(() => {
              for (const item of writes) {
                const result = runCommit(item);
                if (result) pending = result;
              }
            });
            if (!pending) {
              open = false;
              return;
            }
            return pending.finally(() => {
              open = false;
            });
          } catch (error) {
            open = false;
            throw error;
          } finally {
            inUpdate = false;
          }
        };
        if (types === false || reducedMotion()) {
          void apply();
          return;
        }
        const start = startViewTransitionOf();
        if (!start) {
          void apply();
          return;
        }
        try {
          if (types.length && supportsTransitionTypes()) start({ update: apply, types });
          else start(apply);
        } catch {
          if (!open) void apply();
        }
      });
    }
  ];

  history.init &&
    onCleanup(
      history.init((value = history.get()) => {
        if (committing) return;
        signal[1]({ ...wrap(value), _navigation: -1 });
      })
    );

  return {
    signal,
    settled: write => settled.has(write),
    utils: history.utils
  };
}

/**
 * The URL a server render is for. The request event (when the harness scopes
 * one) wins; the provider's `url` prop is the fallback for renders outside a
 * request scope (SSG scripts, server-side tests, runtimes without
 * `node:async_hooks`). History adapters are a client navigation concern and
 * play no part in locating a server render.
 */
function serverPage(url?: string): URL | undefined {
  const e = getRequestEvent();
  const source = e ? e.request.url : url;
  return source ? new URL(source, mockBase) : undefined;
}

/** Server default: a static view of the page URL — a server render never navigates. */
function staticIntegration(page?: URL, utils?: RouterHistory["utils"]): RouterIntegration {
  const obj: LocationChange = { value: page ? page.pathname + page.search : "" };
  return {
    signal: [
      () => obj,
      next => {
        const written = resolveLocationWrite(obj, next);
        written && Object.assign(obj, written);
      }
    ],
    utils
  };
}

export function createRouter<const R extends readonly RouteDefinition[]>(
  config: RouterConfig<R>
): RouterInstance<R> {
  if (DEV && typeof config.preloadLinks === "boolean") {
    console.warn(
      "`preloadLinks` takes preload strategies, not a boolean, and preloads nothing by default. " +
        "Use `preloadLinks: intentPreload()` for hover/focus preloading."
    );
  }
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
  const renderPath =
    (config.history && config.history.utils && config.history.utils.renderPath) || undefined;
  const matchPath = (pathname: string) =>
    getRouteMatches(branches(), config.transformUrl ? config.transformUrl(pathname) : pathname);
  // a `paths` node carries its logical pathname under the Href brand
  const pathnameOf = (url: string | TypedPath) =>
    typeof url === "string" ? new URL(url, mockBase).pathname : ((url as any)[HREF] as string);

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
      restoration = createScrollRestoration(isHydrating());
      history = withScrollRestoration(history || browserHistory(), restoration);
    }
    const page = isServer ? serverPage(props.url) : undefined;
    const integration = isServer
      ? staticIntegration(page, config.history && config.history.utils)
      : createIntegration(history || browserHistory(), matchPath, {
          viewTransition: config.viewTransition,
          prepare: restoration ? () => restoration!.arm() : undefined
        });
    let context: Owner;
    const buildContext = () =>
      createRouterContext(integration, branches, () => context, {
        base: basePath,
        singleFlight: config.singleFlight,
        transformUrl: config.transformUrl
      });
    // The route the document arrived on, declared around the initial match
    // (see `describeInitial`); folded out of shipped bundles with `OBSERVE`.
    const routerState = OBSERVE
      ? OBSERVE.attribution.withOrigin(
          describeInitial(matchPath, integration.signal[0]),
          buildContext
        )
      : buildContext();
    if (!isServer) {
      setupNativeEvents({
        preload: config.preloadLinks,
        explicitLinks: config.explicitLinks,
        actionBase: config.actionBase
      })(routerState);
      setupLinkClaims(routerState, config.explicitLinks, config.links);
      if (routerState.singleFlight) onCleanup(setupFlightDataConsumer(routerState));
      restoration && restoration.create();
    } else if (!renderPath) {
      // hash routing renders `#/path` hrefs, which all resolve to the server's one path
      setupServerLinkClaims(routerState, config.explicitLinks, page || new URL(mockBase));
    }
    // Registered on both sides, outside the client-only branch: an owned
    // onSettled takes a hydration id on the server too, so the ids line up.
    // A no-op when the arrival is left to the browser's native restore.
    onSettled(() => restoration && restoration.settled());
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
      return matchPath(pathnameOf(url)).map(({ route, path, params }) => ({
        path: route.originalPath,
        pattern: route.pattern,
        match: path,
        params,
        info: route.info
      }));
    },
    keysFor(url: string | TypedPath): string[] {
      const keys: string[] = [];
      for (const { route } of matchPath(pathnameOf(url))) {
        const key = (serverRouteOf(route.component)?.call as { key?: unknown } | undefined)?.key;
        typeof key === "string" && key && !keys.includes(key) && keys.push(key);
      }
      return keys;
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
