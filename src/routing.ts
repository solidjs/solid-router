import { Accessor, flush, runWithOwner, type Signal } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  createComponent,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext
} from "solid-js";
import { isServer, getRequestEvent } from "@solidjs/web";
import { createBeforeLeave } from "./lifecycle.js";
import type {
  BeforeLeaveEventArgs,
  Branch,
  Intent,
  Location,
  LocationChange,
  MatchFilters,
  MaybePreloadableComponent,
  NavigateOptions,
  Navigator,
  Params,
  RouteDescription,
  RouteContext,
  RouteDefinition,
  RouteMatch,
  RouterContext,
  RouterIntegration,
  SetParams,
  Submission,
  SearchParams,
  SetSearchParams,
  TypedPath,
  TypedSearchPath
} from "./types.js";
import {
  mockBase,
  comparablePath,
  createMemoObject,
  extractSearchParams,
  invariant,
  normalizePath,
  resolvePath,
  createMatcher,
  joinPaths,
  scoreRoute,
  mergeSearchString,
  expandOptionals
} from "./utils.js";
import { clearFlashCookie, hasFlashCookie } from "./data/flashCookie.js";
import type { FlashSubmission } from "./data/flash.js";

const MAX_REDIRECTS = 100;

/** Consider this API opaque and internal. It is likely to change in the future. */
export const RouterContextObj = createContext<RouterContext>();
export const RouteContextObj = createContext<RouteContext>();

function useOptionalContext<T>(context: { defaultValue?: T }) {
  try {
    return useContext(context as never) as T | undefined;
  } catch {
    return undefined;
  }
}

export const useRouter = () =>
  invariant(
    useContext(RouterContextObj),
    "<A> and 'use' router primitives can be only used inside a Route."
  );

let TempRoute: RouteContext | undefined;
export const useRoute = () => TempRoute || useOptionalContext(RouteContextObj) || useRouter().base;

export const useResolvedPath = (path: () => string) => {
  const route = useRoute();
  return createMemo(() => route.resolvePath(path()));
};

export const useHref = <T extends string | undefined>(to: () => T): () => string | T => {
  const router = useRouter();
  return createMemo(() => {
    const to_ = to();
    return to_ !== undefined ? router.renderPath(to_) : to_;
  });
};

/**
 * Retrieves method to do navigation. The method accepts a path to navigate to and an optional object with the following options:
 * 
 * - resolve (*boolean*, default `true`): resolve the path against the current route
 * - replace (*boolean*, default `false`): replace the history entry
 * - scroll (*boolean*, default `true`): scroll to top after navigation
 * - state (*any*, default `undefined`): pass custom state to `location.state`
 * 
 * **Note**: The state is serialized using the structured clone algorithm which does not support all object types.
 * 
 * @example
 * ```js
 * const navigate = useNavigate();
 * 
 * if (unauthorized) {
 *   navigate("/login", { replace: true });
 * }
 * ```
 */
export const useNavigate = () => useRouter().navigatorFactory();

/**
 * Retrieves reactive `location` object useful for getting things like `pathname`.
 * 
 * @example
 * ```js
 * const location = useLocation();
 * 
 * const pathname = createMemo(() => parsePath(location.pathname));
 * ```
 */
export const useLocation = <S = unknown>() => useRouter().location as Location<S>;

/**
 * Retrieves a signal that indicates whether the router is currently processing a navigation.
 * Useful for showing pending navigation state while the next route and its data settle.
 * 
 * @example
 * ```js
 * const isRouting = useIsRouting();
 * 
 * return (
 *   <div classList={{ "grey-out": isRouting() }}>
 *     <MyAwesomeContent />
 *   </div>
 * );
 * ```
 */
export const useIsRouting = () => useRouter().isRouting;

/**
 * `useMatch` takes an accessor that returns the path and creates a `Memo` that returns match information if the current path matches the provided path.
 * Useful for determining if a given path matches the current route.
 * 
 * @example
 * ```js
 * const match = useMatch(() => props.href);
 * 
 * return <div classList={{ active: Boolean(match()) }} />;
 * ```
 */
export const useMatch = <S extends string>(path: () => S, matchFilters?: MatchFilters<S>) => {
  const location = useLocation();
  const matchers = createMemo(() =>
    expandOptionals(path()).map(path => createMatcher(path, undefined, matchFilters))
  );
  return createMemo(() => {
    for (const matcher of matchers()) {
      const match = matcher(location.pathname);
      if (match) return match;
    }
  });
};

/**
 * `useMatches` returns an accessor of every route match for the current
 * location, outermost first. Useful for reading `info` metadata off the
 * matched chain (previously `useCurrentMatches`).
 *
 * @example
 * ```js
 * const matches = useMatches();
 *
 * const breadcrumbs = createMemo(() => matches().map(m => m.route.info.breadcrumb));
 * ```
 */
export const useMatches = () => {
  const router = useRouter();
  // return a copy so user mutations (eg. `.reverse()`) can't corrupt router state
  return () => router.matches().slice();
};

/**
 * `usePreloadRoute` returns a function for warming a route by hand — the same
 * work link hover/focus intent triggers automatically: the matched routes'
 * lazy components load, and with `preloadData` their `preload` functions run.
 *
 * @example
 * ```js
 * const preload = usePreloadRoute();
 *
 * preload(paths.users(2).settings, { preloadData: true });
 * ```
 */
export const usePreloadRoute = () => {
  const pre = useRouter().preloadRoute;
  return (url: string | URL | TypedPath, options: { preloadData?: boolean } = {}) =>
    pre(url instanceof URL ? url : new URL(String(url), mockBase), options.preloadData);
};

/**
 * Retrieves a reactive, store-like object containing the current route path parameters as defined in the Route.
 * 
 * @example
 * ```js
 * const params = useParams();
 * 
 * // fetch user based on the id path parameter
 * const getUser = query(() => fetchUser(params.id), "user");
 * ```
 */
export function useParams<T extends Params>(): T;
export function useParams<P extends Params>(path: TypedPath<P>): { [K in keyof P]: P[K] };
export function useParams(_path?: TypedPath): Params {
  return useRoute().params;
}

/**
 * Retrieves a tuple containing a reactive object to read the current location's query parameters and a method to update them.
 * The object is a proxy so you must access properties to subscribe to reactive updates.
 * **Note** that values will be strings and property names will retain their casing.
 * 
 * The setter method accepts an object whose entries will be merged into the current query string.
 * Values `''`, `undefined` and `null` will remove the key from the resulting query string.
 * Updates will behave just like a navigation and the setter accepts the same optional second parameter as `navigate` and auto-scrolling is disabled by default.
 * 
 * @examples
 * ```js
 * const [searchParams, setSearchParams] = useSearchParams();
 * 
 * return (
 *   <div>
 *     <span>Page: {searchParams.page}</span>
 *     <button
 *       onClick={() =>
 *         setSearchParams({ page: (parseInt(searchParams.page) || 0) + 1 })
 *       }
 *     >
 *       Next Page
 *     </button>
 *   </div>
 * );
 * ```
 */
export function useSearchParams<In, Out>(
  path: TypedSearchPath<In, Out>
): [Out, (params: Partial<In>, options?: Partial<NavigateOptions>) => void];
export function useSearchParams<T extends SearchParams>(): [
  Partial<T>,
  (params: SetSearchParams, options?: Partial<NavigateOptions>) => void
];
export function useSearchParams(
  path?: TypedSearchPath<any, any>
): [SearchParams, (params: SetSearchParams, options?: Partial<NavigateOptions>) => void] {
  const router = useRouter();
  const location = router.location;
  const navigate = useNavigate();
  const setSearchParams = (params: SetSearchParams, options?: Partial<NavigateOptions>) => {
    const to = untrack(() => {
      // merge onto the in-flight navigation target (if any) so consecutive
      // synchronous calls compose instead of the later one winning
      const pending = router.pendingTarget && new URL(router.pendingTarget.value, mockBase);
      const pathname = pending ? pending.pathname : location.pathname;
      const search = pending ? pending.search : location.search;
      const hash = pending ? pending.hash : location.hash;
      return pathname + mergeSearchString(search, params) + hash;
    });
    navigate(to, {
      scroll: false,
      resolve: false,
      ...options
    });
  };
  // Passing a paths node opts into schema parsing. The node itself is a
  // type-level reference; the schemas that run come from the currently
  // matched routes (root→leaf), whose outputs merge over the raw query.
  // A schema that reports issues is skipped, leaving raw values — search
  // strings are user input, so defaults belong in the schema itself.
  const query = path
    ? createMemoObject(
        createMemo(() => {
          const raw: Record<string, any> = { ...location.query };
          let result: Record<string, any> | undefined;
          for (const match of router.matches()) {
            const schema = (match.route.key as RouteDefinition).search;
            if (!schema) continue;
            const outcome = schema["~standard"].validate(raw);
            if (outcome instanceof Promise)
              throw new Error("Async Standard Schema validation is not supported for search params");
            if (!outcome.issues) result = Object.assign(result || { ...raw }, outcome.value);
          }
          return result || raw;
        })
      )
    : location.query;
  return [query, setSearchParams];
}

export interface LinkState {
  /** The location matches this link or lives under it (exact-only when `end`). Styling: `data-active`. */
  active: () => boolean;
  /** The location matches this link exactly — what `aria-current="page"` reflects. */
  current: () => boolean;
  /** This link is the target of an in-flight navigation. Styling: `data-pending`. */
  pending: () => boolean;
}


/**
 * Reactive link state for custom link components — the programmatic
 * counterpart of the attribute vocabulary plain anchors receive
 * (`aria-current`, `data-active`, `data-pending`).
 *
 * @example
 * ```tsx
 * function TabLink(props: { href: string; children: JSX.Element }) {
 *   const link = useLinkState(() => props.href);
 *   return (
 *     <a href={props.href} class="tab" data-selected={link.active() || undefined}>
 *       {props.children}
 *     </a>
 *   );
 * }
 * ```
 */
export const useLinkState = (
  href: () => string | TypedPath,
  options: { end?: boolean } = {}
): LinkState => {
  const router = useRouter();
  const location = router.location;
  const to = useResolvedPath(() => String(href()));
  // trailing slashes are ignored so `/route` and `/route/` share state
  const path = createMemo(() => {
    const to_ = to();
    return to_ === undefined ? undefined : comparablePath(to_);
  });
  const matches = (loc: string) => {
    const path_ = path();
    if (path_ === undefined) return [false, false] as const;
    const exact = loc === path_;
    return [exact || (!options.end && loc.startsWith(path_ + "/")), exact] as const;
  };
  const state = createMemo(() => matches(decodeURI(comparablePath(location.pathname))));
  return {
    active: () => state()[0],
    current: () => state()[1],
    // match the in-flight target explicitly (rather than active-while-routing)
    // so the answer is the same from pure reads and from effects, which
    // observe the committed location during a transition
    pending: createMemo(() => {
      state(); // location dependency: mid-flight target swaps recompute
      return (
        router.isRouting() &&
        !!router.pendingTarget &&
        matches(decodeURI(comparablePath(router.pendingTarget.value)))[0]
      );
    })
  };
};

/**
 * useBeforeLeave takes a function that will be called prior to leaving a route.
 * The function will be called with:
 * 
 * - from (*Location*): current location (before change).
 * - to (*string | number*): path passed to `navigate`.
 * - options (*NavigateOptions*): options passed to navigate.
 * - preventDefault (*function*): call to block the route change.
 * - defaultPrevented (*readonly boolean*): `true` if any previously called leave handlers called `preventDefault`.
 * - retry (*function*, force?: boolean ): call to retry the same navigation, perhaps after confirming with the user. Pass `true` to skip running the leave handlers again (i.e. force navigate without confirming).
 * 
 * @example
 * ```js
 * useBeforeLeave((e: BeforeLeaveEventArgs) => {
 *   if (form.isDirty && !e.defaultPrevented) {
 *     // preventDefault to block immediately and prompt user async
 *     e.preventDefault();
 *     setTimeout(() => {
 *       if (window.confirm("Discard unsaved changes - are you sure?")) {
 *         // user wants to proceed anyway so retry with force=true
 *         e.retry(true);
 *       }
 *     }, 100);
 *   }
 * });
 * ```
 */
export const useBeforeLeave = (listener: (e: BeforeLeaveEventArgs) => void) => {
  const s = useRouter().beforeLeave.subscribe({
    listener,
    location: useLocation(),
    navigate: useNavigate()
  });
  onCleanup(s);
};

// Encodes a static path segment like `encodeURIComponent`, but leaves RFC 3986
// pchar characters (sub-delims / ":" / "@") literal, matching how browsers
// report them in `location.pathname`. Non-ASCII characters (eg. CJK paths) are
// still percent-encoded exactly as before, since browsers encode those too.
const encodeSegment = (s: string) =>
  encodeURIComponent(s).replace(/%(2B|40|3A|24|26|2C|3B|3D)/g, m => decodeURIComponent(m));

export function createRoutes(routeDef: RouteDefinition, base: string = ""): RouteDescription[] {
  const { component, preload, children, info } = routeDef;
  const isLeaf = !children || (Array.isArray(children) && !children.length);

  const shared = {
    key: routeDef,
    component,
    preload,
    info
  };

  return asArray(routeDef.path).reduce<RouteDescription[]>((acc, originalPath) => {
    for (const expandedPath of expandOptionals(originalPath)) {
      const path = joinPaths(base, expandedPath);
      let pattern = isLeaf ? path : path.split("/*", 1)[0];
      pattern = pattern
        .split("/")
        .map((s: string) => {
          return s.startsWith(":") || s.startsWith("*") ? s : encodeSegment(s);
        })
        .join("/");
      acc.push({
        ...shared,
        originalPath,
        pattern,
        matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
      });
    }
    return acc;
  }, []);
}

export function createBranch(routes: RouteDescription[], index: number = 0): Branch {
  return {
    routes,
    score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
    matcher(location) {
      const matches: RouteMatch[] = [];
      for (let i = routes.length - 1; i >= 0; i--) {
        const route = routes[i];
        const match = route.matcher(location);
        if (!match) {
          return null;
        }
        matches.unshift({
          ...match,
          route
        });
      }
      return matches;
    }
  };
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? value : [value as T];
}

export function createBranches(
  routeDef: RouteDefinition | readonly RouteDefinition[],
  base: string = "",
  stack: RouteDescription[] = [],
  branches: Branch[] = []
): Branch[] {
  const routeDefs = asArray(routeDef);

  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    if (def && typeof def === "object") {
      if (!def.hasOwnProperty("path")) def.path = "";
      const routes = createRoutes(def, base);
      for (const route of routes) {
        stack.push(route);
        const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
        if (def.children && !isEmptyArray) {
          createBranches(def.children, route.pattern, stack, branches);
        } else {
          const branch = createBranch([...stack], branches.length);
          branches.push(branch);
        }

        stack.pop();
      }
    }
  }

  // Stack will be empty on final return
  return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}

export function getRouteMatches(branches: Branch[], location: string): RouteMatch[] {
  for (let i = 0, len = branches.length; i < len; i++) {
    const match = branches[i].matcher(location);
    if (match) {
      return match;
    }
  }
  return [];
}

export function mergeParams(matches: RouteMatch[]): Params {
  const params: Params = {};
  for (let i = 0; i < matches.length; i++) {
    Object.assign(params, matches[i].params);
  }
  return params;
}

function createLocation(
  path: Accessor<string>,
  state: Accessor<any>,
  queryWrapper?: (getQuery: () => SearchParams) => SearchParams
): Location {
  const origin = new URL(mockBase);
  const url = createMemo<URL>(
    (prev = origin) => {
      const path_ = path();
      try {
        // anchor rooted paths against the origin explicitly - a path with
        // doubled leading slashes would otherwise parse as protocol-relative
        return new URL(path_[0] === "/" ? mockBase + path_ : path_, origin);
      } catch (err) {
        console.error(`Invalid path ${path_}`);
        return prev;
      }
    },
    {
      equals: (a, b) => a.href === b.href
    }
  );

  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search);
  const hash = createMemo(() => url().hash);
  const key = () => "";
  const queryFn = createMemo(() => extractSearchParams(url()));

  return {
    get pathname() {
      return pathname();
    },
    get search() {
      return search();
    },
    get hash() {
      return hash();
    },
    get state() {
      return state();
    },
    get key() {
      return key();
    },
    query: queryWrapper ? queryWrapper(queryFn) : createMemoObject(queryFn)
  };
}

/**
 * Rendezvous between the router and the data layer's single-flight consumer.
 * The Router registers itself at mount (unless `singleFlight={false}`); the
 * action side provides the consumer factory when the first action is created
 * (see data/action.ts). Whichever side arrives first waits for the other, so
 * an action module loaded lazily (a code-split route) still attaches to the
 * already-mounted router — and a router-only app, where no action ever
 * loads, never subscribes to the transport, so the server is never asked to
 * collect.
 */
let flightConsumerFactory: ((router: RouterContext) => () => void) | undefined;
const flightRouters = new Map<RouterContext, (() => void) | undefined>();

export function registerFlightRouter(router: RouterContext): () => void {
  flightRouters.set(router, flightConsumerFactory && flightConsumerFactory(router));
  return () => {
    const unsubscribe = flightRouters.get(router);
    flightRouters.delete(router);
    unsubscribe && unsubscribe();
  };
}

export function provideFlightConsumer(factory: (router: RouterContext) => () => void): void {
  if (flightConsumerFactory) return;
  flightConsumerFactory = factory;
  for (const [router, unsubscribe] of flightRouters) {
    if (!unsubscribe) flightRouters.set(router, factory(router));
  }
}

/**
 * The flash-cookie codec, provided by the action side (data/action.ts) so
 * the router core never carries it: the core consumes the cookie eagerly
 * per request (detection + one-shot clear via the tiny flashCookie.ts half)
 * but defers decoding to this slot, read when the submissions signal
 * initializes. Actions are created at module scope, so on the server the
 * decoder is always installed before useSubmission can read — and a
 * router-only app, where it never installs, has no actions that could have
 * produced a flash cookie in the first place.
 */
let flashDecoder: ((cookieHeader: string | null) => FlashSubmission | undefined) | undefined;

export function provideFlashDecoder(
  decoder: (cookieHeader: string | null) => FlashSubmission | undefined
): void {
  flashDecoder || (flashDecoder = decoder);
}

let intent: Intent | undefined;
export function getIntent() {
  return intent;
}
let inPreloadFn = false;
export function getInPreloadFn() {
  return inPreloadFn;
}
export function setInPreloadFn(value: boolean) {
  inPreloadFn = value;
}

export function createRouterContext(
  integration: RouterIntegration,
  branches: () => Branch[],
  getContext?: () => any,
  options: { base?: string; singleFlight?: boolean; transformUrl?: (url: string) => string } = {}
): RouterContext {
  const {
    signal: [source, setSource],
    utils = {}
  } = integration;

  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  const beforeLeave = utils.beforeLeave || createBeforeLeave();

  const basePath = resolvePath("", options.base || "");
  const initialSource = untrack(source);
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !initialSource.value) {
    setSource({ value: basePath, replace: true, scroll: false });
  }

  const [isRouting, setIsRouting] = createSignal(false, { ownedWrite: true });

  // Navigate override written from event handlers.
  const [navigateTarget, setNavigateTarget] = createSignal<LocationChange | undefined>(undefined, {
    ownedWrite: true
  });

  // Keep track of last target, so that last call to navigate wins
  let lastTransitionTarget: LocationChange | undefined;

  // source() remains canonical for native history changes; navigateTarget()
  // temporarily overrides it for in-flight programmatic navigation.
  const effective = createMemo(() => navigateTarget() ?? source());
  const location = createLocation(() => effective().value, () => effective().state, utils.queryWrapper);
  const referrers: LocationChange[] = [];
  // The flash cookie is consumed eagerly: its one-shot clear (Set-Cookie)
  // must be appended before streaming flushes the response headers, and an
  // unread outcome must not haunt a later request's render. Only detection
  // and clearing happen here (the tiny flashCookie.ts half); the raw header
  // is stashed and decoding waits for the action-provided codec, read when
  // the lazily allocated submissions signal below first initializes.
  let flashCookieHeader: string | null | undefined;
  if (isServer) {
    const e = getRequestEvent();
    if (e && !(e.router && e.router.submission)) {
      const cookieHeader = e.request.headers.get("cookie");
      if (hasFlashCookie(cookieHeader)) {
        flashCookieHeader = cookieHeader;
        // one-shot: clear it even when unreadable so it can't haunt later renders
        if (e.response && e.response.headers)
          e.response.headers.append("Set-Cookie", clearFlashCookie());
      }
    }
  }
  let submissions: Signal<Submission<any, any>[]> | undefined;

  const matches = createMemo(() => {
    if (typeof options.transformUrl === "function") {
      return getRouteMatches(branches(), options.transformUrl(location.pathname));
    }

    return getRouteMatches(branches(), location.pathname);
  });

  const buildParams = () => mergeParams(matches());

  const wrapParams = utils.paramsWrapper
    ? (getParams: () => Params) => utils.paramsWrapper!(getParams, branches)
    : (getParams: () => Params) => createMemoObject(getParams);

  const params = wrapParams(buildParams);

  const baseRoute: RouteContext = {
    pattern: basePath,
    params,
    path: () => basePath,
    outlet: () => null,
    resolvePath(to: string) {
      return resolvePath(basePath, to);
    }
  };

  return {
    base: baseRoute,
    location,
    params,
    wrapParams,
    isRouting,
    get pendingTarget() {
      return lastTransitionTarget;
    },
    renderPath,
    parsePath,
    navigatorFactory,
    matches,
    beforeLeave,
    preloadRoute,
    singleFlight: options.singleFlight === undefined ? true : options.singleFlight,
    get submissions() {
      return (submissions ||= createSignal<Submission<any, any>[]>(
        isServer ? initSubmissions() : [],
        { ownedWrite: true }
      ));
    }
  };

  function navigateFromRoute(
    route: RouteContext,
    to: string | TypedPath | number,
    options?: Partial<NavigateOptions>
  ) {
    // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
    untrack(() => {
      if (typeof to === "number") {
        if (!to) {
          // A delta of 0 means stay at the current location, so it is ignored
        } else if (utils.go) {
          utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }
      // typed path proxy nodes coerce to their href
      if (typeof to !== "string") to = to.toString();

      const queryOnly = !to || to[0] === "?";
      const {
        replace,
        resolve,
        scroll,
        state: nextState
      } = {
        replace: false,
        resolve: !queryOnly,
        scroll: true,
        ...options
      };

      const resolvedTo = resolve
        ? route.resolvePath(to)
        : resolvePath((queryOnly && location.pathname) || "", to);

      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const current = effective();

      if (resolvedTo !== current.value || nextState !== current.state) {
        if (isServer) {
          const e = getRequestEvent();
          e && (e.response = { status: 302, headers: new Headers({ Location: resolvedTo }) });
          setSource({ value: resolvedTo, replace, scroll, state: nextState });
        } else if (beforeLeave.confirm(resolvedTo, options)) {
          referrers.push({ value: current.value, replace, scroll, state: current.state });
          const newTarget: LocationChange = {
            value: resolvedTo,
            state: nextState
          };

          const firstNavigation = lastTransitionTarget === undefined;
          intent = "navigate";
          // assign the target before flushing so effects that run for the
          // isRouting flip (e.g. pending link state) can read it
          lastTransitionTarget = newTarget;

          if (firstNavigation) {
            setIsRouting(true);
            flush();
          }

          if (lastTransitionTarget === newTarget) {
            setNavigateTarget({ ...lastTransitionTarget });

            queueMicrotask(() => {
              if (lastTransitionTarget !== newTarget) return;

              intent = undefined;
              navigateEnd(lastTransitionTarget);
              setNavigateTarget(undefined);
              setIsRouting(false);
              lastTransitionTarget = undefined;
            });
          }
        }
      }
    });
  }

  function navigatorFactory(route?: RouteContext): Navigator {
    // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
    route = route || useOptionalContext(RouteContextObj) || baseRoute;
    return (to: string | TypedPath | number, options?: Partial<NavigateOptions>) =>
      navigateFromRoute(route!, to, options);
  }

  function navigateEnd(next: LocationChange) {
    const first = referrers[0];
    if (first) {
      setSource({
        ...next,
        replace: first.replace,
        scroll: first.scroll
      });
      referrers.length = 0;
    }
  }

  function preloadRoute(url: URL, preloadData?: boolean) {
    const matches = getRouteMatches(branches(), url.pathname);
    const prevIntent = intent;
    intent = "preload";
    for (let match in matches) {
      const { route, params } = matches[match];
      route.component &&
        (route.component as MaybePreloadableComponent).preload &&
        (route.component as MaybePreloadableComponent).preload!();
      const { preload } = route;
      inPreloadFn = true;
      preloadData &&
        preload &&
        runWithOwner(getContext!(), () =>
          preload({
            params,
            location: {
              pathname: url.pathname,
              search: url.search,
              hash: url.hash,
              query: extractSearchParams(url),
              state: null,
              key: ""
            },
            intent: "preload"
          })
        );
      inPreloadFn = false;
    }
    intent = prevIntent;
  }

  // Seeds the initial submission from a no-JS form post: the server
  // function handler redirected back with the outcome in a one-shot flash
  // cookie (see src/server.ts's handleNoJS), consumed eagerly above and
  // decoded here — so the post-redirect SSR renders useSubmission() state
  // exactly as a scripted submission would. An explicitly pre-seeded
  // `event.router.submission` (framework integrations) takes precedence.
  function initSubmissions() {
    const e = getRequestEvent();
    const submission =
      (e && e.router && e.router.submission) ||
      (flashDecoder && flashCookieHeader !== undefined
        ? flashDecoder(flashCookieHeader)
        : undefined);
    if (!submission) return [];
    return [
      {
        ...submission,
        clear() {},
        retry() {}
      }
    ] as Array<Submission<any, any>>;
  }
}

export function createRouteContext(
  router: RouterContext,
  parent: RouteContext,
  outlet: () => JSX.Element,
  match: () => RouteMatch,
  matches: () => RouteMatch[] = () => [match()]
): RouteContext {
  const { base, location, wrapParams } = router;
  const { pattern, component, preload } = match().route;
  const path = createMemo(() => match().path);
  // Params scoped to this route's lifetime. `matches` is expected to retain
  // its last valid value while this route is being torn down, so outgoing
  // components and preloads never observe another route's params.
  const params = wrapParams(() => mergeParams(matches()));

  component &&
    (component as MaybePreloadableComponent).preload &&
    (component as MaybePreloadableComponent).preload!();
  inPreloadFn = true;
  const data = preload ? preload({ params, location, intent: intent || "initial" }) : undefined;
  inPreloadFn = false;

  const route: RouteContext = {
    parent,
    pattern,
    params,
    path,
    outlet: () =>
      component
        ? createComponent(component, {
            params,
            location,
            data,
            get children() {
              return outlet();
            }
          })
        : outlet(),
    resolvePath(to: string) {
      return resolvePath(base.path(), to, path());
    }
  };

  return route;
}
