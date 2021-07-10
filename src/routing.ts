import {
  Component,
  createComponent,
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  getOwner,
  JSX,
  on,
  runWithOwner,
  untrack,
  useContext,
  useTransition
} from "solid-js";
import type {
  MatchedRoute,
  NavigateOptions,
  Params,
  RouterIntegration,
  RouterState,
  Route,
  RouteState,
  RouteDefinition,
  RouteUpdateMode,
  RouteUpdateSignal,
  Location
} from "./types";
import {
  createPathMatcher,
  createPath,
  extractQuery,
  invariant,
  resolvePath,
  toArray
} from "./utils";

const MAX_REDIRECTS = 100;

interface Referrer {
  ref: string;
  mode: RouteUpdateMode;
}

export const RouterContext = createContext<RouterState>();
export const RouteContext = createContext<RouteState>();

export const useRouter = () =>
  invariant(useContext(RouterContext), "Make sure your app is wrapped in a <Router />");

export const useRoute = () => useContext(RouteContext) || useRouter().base;

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
export const useLocation = () => useRouter().location;
export const useIsRouting = () => useRouter().isRouting;

export const useMatch = (path: () => string) => {
  const location = useLocation();
  const matcher = createMemo(() => createPathMatcher(path()));
  return createMemo(() => matcher()(location.pathname));
};

export const useParams = <T extends Params>() => useRoute().params as T;

export const useData = <T extends Params>(delta: number = 0) => {
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

export function createRoutes(
  routes: RouteDefinition | RouteDefinition[],
  base: string = "",
  fallback: Component | null = null
): Route[] {
  return toArray(routes).map<Route>((route, i, arr) => {
    const { children } = route;
    const path = createPath(route.path, base, !!children);

    return {
      originalPath: route.path,
      pattern: path,
      element: () => {
        const { element = fallback } = route;
        // Handle component form
        if (typeof element === "function" && element.length) {
          return createComponent(element, {});
        }
        return element as JSX.Element;
      },
      data: route.data,
      matcher: createPathMatcher(path, arr.length - i),
      children: children && createRoutes(children, path, fallback)
    };
  });
}

export function getMatches(
  routes: Route[],
  location: string,
  acc: MatchedRoute[] = []
): MatchedRoute[] {
  const winner = routes.reduce<MatchedRoute | undefined>((winner, route) => {
    const match = route.matcher(location);
    if (match && (!winner || match.score > winner.score)) {
      return {
        route,
        ...match
      };
    }
    return winner;
  }, undefined);

  if (winner) {
    acc.push(winner);
    if (winner.route.children) {
      getMatches(winner.route.children, location, acc);
    }
  }

  return acc;
}

export function createMemoObject<T extends object>(fn: () => T): T {
  const map = new Map();
  const owner = getOwner()!;
  return new Proxy(
    {},
    {
      get(_, property) {
        const memo =
          map.get(property) ||
          runWithOwner(owner, () => {
            const p = createMemo(() => (fn() as any)[property]);
            map.set(property, p);
            return p;
          });
        return memo();
      }
    }
  ) as T;
}

function normalizeIntegration(
  integration: RouterIntegration | RouteUpdateSignal | undefined
): RouterIntegration {
  if (!integration) {
    return {
      signal: createSignal({ value: "" })
    };
  } else if (Array.isArray(integration)) {
    return {
      signal: integration
    };
  }
  return integration;
}

export function createLocation(path: () => string): Location {
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
    query: createMemoObject(on(search, () => extractQuery(url())) as () => Params)
  };
}

export function createRouterState(
  integration?: RouterIntegration | RouteUpdateSignal,
  base: string = ""
): RouterState {
  const {
    signal: [source, setSource],
    utils
  } = normalizeIntegration(integration);

  const basePath = resolvePath("", base);

  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({ value: basePath, mode: "init" });
  }

  const baseRoute: RouteState = {
    pattern: basePath,
    params: {},
    path: () => basePath,
    outlet: () => null,
    resolvePath(to: string) {
      return resolvePath(basePath, to);
    }
  };

  const referrers: Referrer[] = [];
  const [isRouting, start] = useTransition();
  const [reference, setReference] = createSignal(source().value);
  const location = createLocation(reference);

  // The `navigate` function looks up the closest route to handle resolution. Redfining this makes
  // testing the router state easier as we don't have to wrap the test in the RouterContext.
  const useRoute = () => useContext(RouteContext) || baseRoute;

  function navigate(to: string | number, options?: Partial<NavigateOptions>) {
    if (typeof to === "number") {
      console.log("Relative navigation is not implemented - doing nothing :)");
      return;
    }

    const finalOptions = {
      replace: false,
      resolve: true,
      state: null,
      ...options
    };

    const resolvedTo = finalOptions.resolve ? useRoute().resolvePath(to) : resolvePath("", to);

    if (resolvedTo === undefined) {
      throw new Error(`Path '${to}' is not a routable path`);
    }

    const redirectCount = referrers.push({
      ref: untrack(reference),
      mode: finalOptions.replace ? "replace" : "push"
    });

    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("Too many redirects");
    }

    start(() => setReference(resolvedTo!));
  }

  function handleRouteEnd(nextRef: string) {
    const first = referrers.shift();
    if (first) {
      if (nextRef !== first.ref) {
        setSource({
          value: nextRef,
          mode: first.mode
        });
      }
      referrers.length = 0;
    }
  }

  createRenderEffect(() => {
    start(() => setReference(source().value));
  });

  createRenderEffect(() => {
    handleRouteEnd(reference());
  });

  return {
    base: baseRoute,
    location,
    isRouting,
    renderPath: utils?.renderPath || ((path: string) => path),
    navigate
  };
}

export function createRouteState(
  router: RouterState,
  parent: RouteState,
  child: () => RouteState,
  match: () => MatchedRoute
): RouteState {
  const { route } = match();
  const safeRoute = createMemo<MatchedRoute>(prev => {
    const m = match();
    if (!m) {
      console.log("!! THIS IS A BUG !! A match evaluated for a route that will be disposed");
      return prev!;
    }
    return m;
  });
  const path = createMemo(() => safeRoute().path);
  const params = createMemoObject<Record<string, string>>(
    on(path, () => safeRoute().params) as () => Record<string, string>
  );

  const routeState: RouteState = {
    parent,
    pattern: route.pattern,
    get child() {
      return child();
    },
    path,
    params,
    outlet: () => route.element(),
    resolvePath(to: string) {
      return resolvePath(router.base.path(), to, path());
    }
  };

  if (route.data) {
    routeState.data = route.data({
      params,
      location: router.location,
      navigate: router.navigate
    });
  }

  return routeState;
}
