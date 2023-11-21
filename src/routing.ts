import { Component, JSX, Accessor } from "solid-js";
import {
  createComponent,
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
  untrack,
  useContext,
  startTransition,
  resetErrorBoundaries
} from "solid-js";
import { isServer, delegateEvents, getRequestEvent } from "solid-js/web";
import { normalizeIntegration } from "./integration";
import { createBeforeLeave } from "./lifecycle";
import type {
  BeforeLeaveEventArgs,
  Branch,
  Intent,
  Location,
  LocationChange,
  LocationChangeSignal,
  MatchFilters,
  NavigateOptions,
  Navigator,
  Params,
  Route,
  RouteContext,
  RouteDefinition,
  RouteMatch,
  RouterContext,
  RouterIntegration,
  SetParams,
  Submission
} from "./types";
import {
  createMemoObject,
  extractSearchParams,
  invariant,
  resolvePath,
  createMatcher,
  joinPaths,
  scoreRoute,
  mergeSearchString,
  expandOptionals
} from "./utils";

const MAX_REDIRECTS = 100;

interface MaybePreloadableComponent extends Component {
  preload?: () => void;
}

export const RouterContextObj = createContext<RouterContext>();
export const RouteContextObj = createContext<RouteContext>();

export const useRouter = () =>
  invariant(useContext(RouterContextObj), "Make sure your app is wrapped in a <Router />");

let TempRoute: RouteContext | undefined;
export const useRoute = () => TempRoute || useContext(RouteContextObj) || useRouter().base;

export const useResolvedPath = (path: () => string) => {
  const route = useRoute();
  return createMemo(() => route.resolvePath(path()));
};

export const useHref = (to: () => string | undefined) => {
  const router = useRouter();
  return createMemo(() => {
    const to_ = to();
    return to_ !== undefined ? router.renderPath(to_) : to_;
  });
};

export const useNavigate = () => useRouter().navigatorFactory();
export const useLocation = <S = unknown>() => useRouter().location as Location<S>;
export const useIsRouting = () => useRouter().isRouting;

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

export const useParams = <T extends Params>() => useRoute().params as T;

export const useSearchParams = <T extends Params>(): [
  T,
  (params: SetParams, options?: Partial<NavigateOptions>) => void
] => {
  const location = useLocation();
  const navigate = useNavigate();
  const setSearchParams = (params: SetParams, options?: Partial<NavigateOptions>) => {
    const searchString = untrack(
      () => location.pathname + mergeSearchString(location.search, params) + location.hash
    );
    navigate(searchString, {
      scroll: false,
      resolve: false,
      ...options
    });
  };
  return [location.query as T, setSearchParams];
};

export const useBeforeLeave = (listener: (e: BeforeLeaveEventArgs) => void) => {
  const s = useRouter().beforeLeave.subscribe({
    listener,
    location: useLocation(),
    navigate: useNavigate()
  });
  onCleanup(s);
};

export function createRoutes(routeDef: RouteDefinition, base: string = ""): Route[] {
  const { component, load, children } = routeDef;
  const isLeaf = !children || (Array.isArray(children) && !children.length);

  const shared = {
    key: routeDef,
    component,
    load
  };

  return asArray(routeDef.path).reduce<Route[]>((acc, path) => {
    for (const originalPath of expandOptionals(path)) {
      const path = joinPaths(base, originalPath);
      const pattern = isLeaf ? path : path.split("/*", 1)[0];
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

export function createBranch(routes: Route[], index: number = 0): Branch {
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

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export function createBranches(
  routeDef: RouteDefinition | RouteDefinition[],
  base: string = "",
  stack: Route[] = [],
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

export function createLocation(path: Accessor<string>, state: Accessor<any>): Location {
  const origin = new URL("http://sar");
  const url = createMemo<URL>(
    prev => {
      const path_ = path();
      try {
        return new URL(path_, origin);
      } catch (err) {
        console.error(`Invalid path ${path_}`);
        return prev;
      }
    },
    origin,
    {
      equals: (a, b) => a.href === b.href
    }
  );

  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search, true);
  const hash = createMemo(() => url().hash);
  const key = () => "";

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
    query: createMemoObject(on(search, () => extractSearchParams(url())) as () => Params)
  };
}

const actions = new Map<string, Function>();
export function registerAction(url: string, fn: Function) {
  actions.set(url, fn);
}

let intent: Intent | undefined;
export function getIntent() {
  return intent;
}

export function createRouterContext(
  integration?: RouterIntegration | LocationChangeSignal,
  getBranches?: () => Branch[],
  base: string = ""
): RouterContext {
  const {
    signal: [source, setSource],
    utils = {}
  } = normalizeIntegration(integration);

  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  const beforeLeave = utils.beforeLeave || createBeforeLeave();
  let submissions: Submission<any, any>[] = [];

  const basePath = resolvePath("", base);
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({ value: basePath, replace: true, scroll: false });
  }

  const [isRouting, setIsRouting] = createSignal(false);
  const start = async (callback: () => void) => {
    setIsRouting(true);
    try {
      await startTransition(callback);
    } finally {
      setIsRouting(false);
    }
  };
  const [reference, setReference] = createSignal(source().value);
  const [state, setState] = createSignal(source().state);
  const location = createLocation(reference, state);
  const referrers: LocationChange[] = [];

  const baseRoute: RouteContext = {
    pattern: basePath,
    params: {},
    path: () => basePath,
    outlet: () => null,
    resolvePath(to: string) {
      return resolvePath(basePath, to);
    }
  };

  function navigateFromRoute(
    route: RouteContext,
    to: string | number,
    options?: Partial<NavigateOptions>
  ) {
    // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
    untrack(() => {
      if (typeof to === "number") {
        if (!to) {
          // A delta of 0 means stay at the current location, so it is ignored
        } else if (utils.go) {
          beforeLeave.confirm(to, options) && utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }

      const {
        replace,
        resolve,
        scroll,
        state: nextState
      } = {
        replace: false,
        resolve: true,
        scroll: true,
        ...options
      };

      const resolvedTo = resolve ? route.resolvePath(to) : resolvePath("", to);

      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const current = reference();

      if (resolvedTo !== current || nextState !== state()) {
        if (isServer) {
          const e = getRequestEvent();
          e &&
            (e.response = new Response(null, { status: 302, headers: { Location: resolvedTo } }));
          setSource({ value: resolvedTo, replace, scroll, state: nextState });
        } else if (beforeLeave.confirm(resolvedTo, options)) {
          const len = referrers.push({ value: current, replace, scroll, state: state() });
          start(() => {
            intent = "navigate";
            setReference(resolvedTo);
            setState(nextState);
            resetErrorBoundaries();
          }).then(() => {
            if (referrers.length === len) {
              intent = undefined;
              navigateEnd({
                value: resolvedTo,
                state: nextState
              });
            }
          });
        }
      }
    });
  }

  function navigatorFactory(route?: RouteContext): Navigator {
    // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
    route = route || useContext(RouteContextObj) || baseRoute;
    return (to: string | number, options?: Partial<NavigateOptions>) =>
      navigateFromRoute(route!, to, options);
  }

  function navigateEnd(next: LocationChange) {
    const first = referrers[0];
    if (first) {
      if (next.value !== first.value || next.state !== first.state) {
        setSource({
          ...next,
          replace: first.replace,
          scroll: first.scroll
        });
      }
      referrers.length = 0;
    }
  }

  createRenderEffect(() => {
    const { value, state } = source();
    // Untrack this whole block so `start` doesn't cause Solid's Listener to be preserved
    untrack(() => {
      if (value !== reference()) {
        start(() => {
          intent = "native";
          setReference(value);
          setState(state);
        }).then(() => {
          intent = undefined;
        });
      }
    });
  });

  if (!isServer) {
    let preloadTimeout: Record<string, number> = {};

    function isSvg<T extends SVGElement>(el: T | HTMLElement): el is T {
      return el.namespaceURI === "http://www.w3.org/2000/svg";
    }

    function handleAnchor(evt: MouseEvent) {
      if (
        evt.defaultPrevented ||
        evt.button !== 0 ||
        evt.metaKey ||
        evt.altKey ||
        evt.ctrlKey ||
        evt.shiftKey
      )
        return;

      const a = evt
        .composedPath()
        .find(el => el instanceof Node && el.nodeName.toUpperCase() === "A") as
        | HTMLAnchorElement
        | SVGAElement
        | undefined;

      if (!a) return;

      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || (!href && !a.hasAttribute("state"))) return;

      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || (rel && rel.includes("external"))) return;

      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      if (
        url.origin !== window.location.origin ||
        (basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase()))
      )
        return;
      return [a, url] as const;
    }

    function handleAnchorClick(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      const to = parsePath(url.pathname + url.search + url.hash);
      const state = a.getAttribute("state");

      evt.preventDefault();
      navigateFromRoute(baseRoute, to, {
        resolve: false,
        replace: a.hasAttribute("replace"),
        scroll: !a.hasAttribute("noscroll"),
        state: state && JSON.parse(state)
      });
    }

    function doPreload(a: HTMLAnchorElement | SVGAElement, url: URL) {
      const preload = a.getAttribute("preload") !== "false";
      const matches = getRouteMatches(getBranches!(), url.pathname);
      const prevIntent = intent;
      intent = "preload";
      for (let match in matches) {
        const { route, params } = matches[match];
        route.component &&
          (route.component as MaybePreloadableComponent).preload &&
          (route.component as MaybePreloadableComponent).preload!();
        preload &&
          route.load &&
          route.load({
            params,
            location: {
              pathname: url.pathname,
              search: url.search,
              hash: url.hash,
              query: extractSearchParams(url),
              state: null,
              key: ""
            },
            intent
          });
      }
      intent = prevIntent;
    }

    function handleAnchorPreload(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      if (!preloadTimeout[url.pathname]) doPreload(a, url);
    }

    function handleAnchorIn(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [a, url] = res;
      if (preloadTimeout[url.pathname]) return;
      preloadTimeout[url.pathname] = setTimeout(() => {
        doPreload(a, url);
        delete preloadTimeout[url.pathname];
      }, 200) as any;
    }

    function handleAnchorOut(evt: Event) {
      const res = handleAnchor(evt as MouseEvent);
      if (!res) return;
      const [, url] = res;
      if (preloadTimeout[url.pathname]) {
        clearTimeout(preloadTimeout[url.pathname]);
        delete preloadTimeout[url.pathname];
      }
    }

    function handleFormSubmit(evt: SubmitEvent) {
      let actionRef =
        (evt.submitter && evt.submitter.getAttribute("formaction")) || (evt.target as any).action;
      if (actionRef && actionRef.startsWith("action:")) {
        const data = new FormData(evt.target as HTMLFormElement);
        actions.get(actionRef.slice(7))!(data);
        evt.preventDefault();
      }
    }

    // ensure delegated event run first
    delegateEvents(["click", "submit"]);
    document.addEventListener("click", handleAnchorClick);
    document.addEventListener("mouseover", handleAnchorIn);
    document.addEventListener("mouseout", handleAnchorOut);
    document.addEventListener("focusin", handleAnchorPreload);
    document.addEventListener("touchstart", handleAnchorPreload);
    document.addEventListener("submit", handleFormSubmit);
    onCleanup(() => {
      document.removeEventListener("click", handleAnchorClick);
      document.removeEventListener("mouseover", handleAnchorIn);
      document.removeEventListener("mouseout", handleAnchorOut);
      document.removeEventListener("focusin", handleAnchorPreload);
      document.removeEventListener("touchstart", handleAnchorPreload);
      document.removeEventListener("submit", handleFormSubmit);
    });
  } else {
    function initFromFlash<T>(params: Params) {
      let param = params.form ? JSON.parse(params.form) : null;
      if (!param || !param.result) {
        return [];
      }
      const input = new Map(param.entries);
      return [
        {
          url: param.url,
          result: param.error ? new Error(param.result.message) : param.result,
          input: input as unknown as T
        } as Submission<T, any>
      ];
    }
    submissions = initFromFlash(location.query);
  }

  return {
    base: baseRoute,
    location,
    isRouting,
    renderPath,
    parsePath,
    navigatorFactory,
    beforeLeave,
    submissions: createSignal<Submission<any, any>[]>(submissions)
  };
}

export function createRouteContext(
  router: RouterContext,
  parent: RouteContext,
  outlet: () => JSX.Element,
  match: () => RouteMatch,
  params: Params
): RouteContext {
  const { base, location } = router;
  const { pattern, component, load } = match().route;
  const path = createMemo(() => match().path);

  const route: RouteContext = {
    parent,
    pattern,
    path,
    params,
    outlet: () =>
      component
        ? createComponent(component, {
            params,
            location,
            get children() {
              return outlet();
            }
          })
        : outlet(),
    resolvePath(to: string) {
      return resolvePath(base.path(), to, path());
    }
  };

  component &&
    (component as MaybePreloadableComponent).preload &&
    (component as MaybePreloadableComponent).preload!();
  load && load({ params, location, intent: intent || "navigate" });

  return route;
}
