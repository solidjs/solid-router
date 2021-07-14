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
import type { Component, JSX } from "solid-js";
import { isServer } from "solid-js/web";
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
  toArray,
  createMemoObject
} from "./utils";
import { normalizeIntegration } from "./integration";

const MAX_REDIRECTS = 100;

interface Referrer {
  ref: string;
  mode: RouteUpdateMode;
}

interface MaybePreloadableComponent extends Component {
  preload?: () => void;
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
  fallback?: Component
): Route[] {
  return toArray(routes).map<Route>((route, i, arr) => {
    const { path: originalPath, children, component, data } = route;
    const path = createPath(originalPath, base, !!children);

    return {
      originalPath,
      pattern: path,
      element: component
        ? () => createComponent(component, {})
        : () => {
            const { element } = route;
            return element === undefined && fallback
              ? createComponent(fallback, {})
              : (element as JSX.Element);
          },
      preload: route.component ? (component as MaybePreloadableComponent).preload : route.preload,
      data,
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

      const mode = replace ? "replace" : "push";
      const ref = reference();

      if (resolvedTo !== ref) {
        if (isServer) {
          setSource({ value: resolvedTo, mode });

          // TODO: Abort render and maybe send script to perform client-side redirect for streaming case
        } else {
          referrers.push({ ref, mode });
          start(() => setReference(resolvedTo));
        }
      }
    });
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
  const { base, location, navigate } = router;
  const { pattern, element: outlet, preload, data } = match().route;
  const path = createMemo(() => match().path);
  const params = createMemoObject(on(path, () => match().params) as () => Params);

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
