import type { Component, JSX } from "solid-js";
import {
  createComponent,
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  untrack,
  useContext,
  useTransition
} from "solid-js";
import { isServer } from "solid-js/web";
import { normalizeIntegration } from "./integration";
import type {
  Branch,
  Location,
  LocationChange,
  LocationChangeSignal,
  NavigateOptions,
  Params,
  Route,
  RouteContext,
  RouteDataFunc,
  RouteDefinition,
  RouteMatch,
  RouterContext,
  RouterIntegration,
  RouterOutput
} from "./types";
import {
  createMatcher,
  createMemoObject,
  extractQuery,
  invariant,
  joinPaths,
  resolvePath,
  scoreRoute
} from "./utils";

const MAX_REDIRECTS = 100;

interface MaybePreloadableComponent extends Component {
  preload?: () => void;
}

export const RouterContextObj = createContext<RouterContext>();
export const RouteContextObj = createContext<RouteContext>();

export const useRouter = () =>
  invariant(useContext(RouterContextObj), "Make sure your app is wrapped in a <Router />");

export const useRoute = () => useContext(RouteContextObj) || useRouter().base;

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

export const useNavigate = () => useRouter().navigate;
export const usePrefetch = () => useRouter().prefetch;
export const useLocation = () => useRouter().location;
export const useIsRouting = () => useRouter().isRouting;

export const useMatch = (path: () => string) => {
  const location = useLocation();
  const matcher = createMemo(() => createMatcher(path()));
  return createMemo(() => matcher()(location.pathname));
};

export const useParams = <T extends Params>() => useRoute().params as T;

export const useData = <T = any>(delta: number = 0) => {
  let current = useRoute();
  let n = delta;
  while (n-- > 0) {
    if (!current.parent) {
      throw new RangeError(`Route ancestor ${delta} is out of bounds`);
    }
    current = current.parent;
  }
  return current.data as T;
};

export function createRoute(
  routeDef: RouteDefinition,
  base: string = "",
  fallback?: Component
): Route {
  const { path: originalPath, component, data, children } = routeDef;
  const isLeaf = !children || (Array.isArray(children) && !children.length);
  const path = joinPaths(base, originalPath);
  const pattern = isLeaf ? path : path.split("/*", 1)[0];

  return {
    originalPath,
    pattern,
    element: component
      ? () => createComponent(component, {})
      : () => {
          const { element } = routeDef;
          return element === undefined && fallback
            ? createComponent(fallback, {})
            : (element as JSX.Element);
        },
    preload: routeDef.component
      ? (component as MaybePreloadableComponent).preload
      : routeDef.preload,
    data,
    matcher: createMatcher(pattern, !isLeaf)
  };
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

export function createBranches(
  routeDef: RouteDefinition | RouteDefinition[],
  base: string = "",
  fallback?: Component,
  stack: Route[] = [],
  branches: Branch[] = []
): Branch[] {
  const routeDefs = Array.isArray(routeDef) ? routeDef : [routeDef];

  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    const route = createRoute(def, base, fallback);

    stack.push(route);

    if (def.children) {
      createBranches(def.children, route.pattern, fallback, stack, branches);
    } else {
      const branch = createBranch([...stack], branches.length);
      branches.push(branch);
    }

    stack.pop();
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

const DEFAULT_URL = new URL("http://solidjs.com");

function createUrl(path: string) {
  try {
    return new URL(path, DEFAULT_URL);
  } catch (err) {
    console.error(`Invalid path ${path}`);
    return undefined;
  }
}

export function createStaticLocation(url: URL): Location {
  return {
    pathname: url.pathname,
    search: url.search.slice(1),
    hash: url.hash.slice(1),
    state: null,
    key: "",
    query: extractQuery(url)
  };
}

export function createLocation(path: () => string): Location {
  const url = createMemo<URL>(prev => createUrl(path()) || prev, DEFAULT_URL, {
    equals: (a, b) => a.href === b.href
  });

  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search.slice(1));
  const hash = createMemo(() => url().hash.slice(1));
  const state = createMemo(() => null);
  const key = createMemo(() => "");

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
    query: createMemoObject(on(search, () => extractQuery(url())))
  };
}

export function createRouterContext(
  integration?: RouterIntegration | LocationChangeSignal,
  base: string = "",
  data?: RouteDataFunc,
  out?: object
): RouterContext {
  const {
    signal: [source, setSource],
    utils
  } = normalizeIntegration(integration);

  const basePath = resolvePath("", base);
  const output =
    isServer && out
      ? (Object.assign(out, {
          matches: [],
          url: undefined
        }) as RouterOutput)
      : undefined;

  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({ value: basePath, replace: true });
  }

  const [isRouting, start] = useTransition();
  const [reference, setReference] = createSignal(source().value);
  const location = createLocation(reference);
  const referrers: LocationChange[] = [];
  const [prefetchLocation, setPrefetchLocation] = createSignal<Location>();

  const baseRoute: RouteContext = {
    pattern: basePath,
    params: {},
    path: () => basePath,
    outlet: () => null,
    data: data && data({ params: {}, location, navigate }),
    resolvePath(to: string) {
      return resolvePath(basePath, to);
    }
  };

  // The `navigate` function looks up the closest route to handle resolution. Redfining this makes
  // testing the router state easier as we don't have to wrap the test in the RouterContext.
  const useRoute = () => useContext(RouteContextObj) || baseRoute;

  function navigate(to: string | number, options?: Partial<NavigateOptions>) {
    // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
    untrack(() => {
      if (typeof to === "number") {
        console.warn("Relative navigation is not implemented - doing nothing :)");
        return;
      }

      const { replace, resolve } = {
        replace: false,
        resolve: true,
        ...options
      };

      const resolvedTo = resolve ? useRoute().resolvePath(to) : resolvePath("", to);

      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const current = reference();

      if (resolvedTo !== current) {
        if (isServer) {
          if (output) {
            output.url = resolvedTo;
          }
          setSource({ value: resolvedTo, replace });
        } else {
          referrers.push({ value: current, replace });
          start(() => setReference(resolvedTo));
        }
      }
    });
  }

  function navigateEnd(next: string) {
    const first = referrers.shift();
    if (first) {
      if (next !== first.value) {
        setSource({
          value: next,
          replace: first.replace
        });
      }
      referrers.length = 0;
    }
  }

  function prefetch(path: string) {
    const url = createUrl(path);
    const next = url && createStaticLocation(url);
    next &&
      setPrefetchLocation(prev =>
        !prev || next.pathname !== prev.pathname || next.search !== prev.search ? next : prev
      );
  }

  createRenderEffect(() => {
    start(() => setReference(source().value));
  });

  createRenderEffect(() => {
    navigateEnd(reference());
  });

  return {
    base: baseRoute,
    out: output,
    location,
    prefetchLocation,
    isRouting,
    renderPath: (utils && utils.renderPath) || ((path: string) => path),
    navigate,
    prefetch
  };
}

export function createRouteContext(
  router: RouterContext,
  parent: RouteContext,
  child: () => RouteContext,
  match: () => RouteMatch
): RouteContext {
  const { base, location, navigate } = router;
  const { pattern, element: outlet, preload, data } = match().route;
  const path = createMemo(() => match().path);
  const params = createMemoObject(() => match().params);

  preload && preload();

  return {
    parent,
    pattern,
    get child() {
      return child();
    },
    path,
    params,
    outlet,
    data: data && data({ params, location, navigate }),
    resolvePath(to: string) {
      return resolvePath(base.path(), to, path());
    }
  };
}
