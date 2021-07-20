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
  Location,
  LocationChange,
  LocationChangeSignal,
  NavigateOptions,
  Params,
  Route,
  RouteContext,
  RouteDefinition,
  RouteMatch,
  RouterContext,
  RouterIntegration,
  RouterOutput
} from "./types";
import {
  createMemoObject,
  createPath,
  createPathMatcher,
  extractQuery,
  invariant,
  resolvePath,
  toArray
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

export function createRouteMatches(
  routes: Route[],
  location: string,
  acc: RouteMatch[] = []
): RouteMatch[] {
  const winner = routes.reduce<RouteMatch | undefined>((winner, route) => {
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
      createRouteMatches(winner.route.children, location, acc);
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
    query: createMemoObject(on(search, () => extractQuery(url())))
  };
}

export function createRouterContext(
  integration?: RouterIntegration | LocationChangeSignal,
  base: string = "",
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

  const baseRoute: RouteContext = {
    pattern: basePath,
    params: {},
    path: () => basePath,
    outlet: () => null,
    resolvePath(to: string) {
      return resolvePath(basePath, to);
    }
  };

  const [isRouting, start] = useTransition();
  const [reference, setReference] = createSignal(source().value);
  const location = createLocation(reference);
  const referrers: LocationChange[] = [];

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
    isRouting,
    renderPath: utils?.renderPath || ((path: string) => path),
    navigate
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
  const params = createMemoObject(on(path, () => match().params));

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
