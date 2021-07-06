import {
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
  Route,
  MatchedRoute,
  RouterState,
  RouteState,
  RouteDefinition,
  Params,
  RouteUpdateSignal,
  RouterIntegration,
  RouteUpdateMode,
  RedirectOptions
} from "./types";
import {
  createPathMatcher,
  createPath,
  extractQuery,
  invariant,
  resolvePath,
  renderPath,
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
  invariant(
    useContext(RouterContext),
    "Make sure your app is wrapped in a <Router />"
  );

export const useRoute = () => useContext(RouteContext);

export const useResolvedPath = (path: string) => {
  const route = useRoute();
  return route ? route.resolvePath(path) : resolvePath(useRouter().base, path);
};

export function createRoutes(
  routes: RouteDefinition | RouteDefinition[],
  base: string
): Route[] {
  return toArray(routes).map<Route>((route, i, arr) => {
    const { children } = route;
    const path = createPath(route.path, base, !!children);

    return {
      originalPath: route.path,
      pattern: path,
      element: (routeState, router) => {
        const { element } = route;
        // In the case no element was defined on the <Route>, default to the route's outlet
        if (element === undefined) {
          return routeState.outlet;
        }
        // Allow render function with easy access to router and the route context
        if (typeof element === "function" && element.length) {
          return element(routeState, router);
        }
        return element as JSX.Element;
      },
      data: route.data,
      matcher: createPathMatcher(path, arr.length - i),
      children: children && createRoutes(children, path)
    };
  });
}

export function getMatches(
  routes: Route[],
  location: string,
  parentParams: Params,
  acc: MatchedRoute[] = []
): MatchedRoute[] {
  const winner = routes.reduce<MatchedRoute | undefined>((winner, route) => {
    const match = route.matcher(location);
    if (match && (!winner || match.score > winner.score)) {
      return {
        route,
        ...match,
        params: { ...parentParams, ...match.params }
      };
    }
    return winner;
  }, undefined);

  if (winner) {
    acc.push(winner);
    if (winner.route.children) {
      getMatches(winner.route.children, location, parentParams, acc);
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

export function createRouterState(
  integration?: RouterIntegration | RouteUpdateSignal,
  base: string = ""
): RouterState {
  const {
    signal: [source, setSource],
    utils: integrationUtils
  } = normalizeIntegration(integration);
  const utils = {
    renderPath,
    ...integrationUtils
  };
  const basePath = resolvePath("", base);

  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({ value: basePath, mode: "init" });
  }

  const referrers: Referrer[] = [];
  const [isRouting, start] = useTransition();
  const [reference, setReference] = createSignal(source().value);

  const url = createMemo<URL>(
    (prev) => {
      try {
        return new URL(reference(), "http://origin");
      } catch (err) {
        console.error(`Invalid path ${source()}`);
        return prev;
      }
    },
    new URL("/", "http://origin"),
    {
      equals: (a, b) => a.href === b.href
    }
  );
  const path = createMemo(() => url().pathname);
  const queryString = createMemo(() => url().search.slice(1));
  const query = createMemoObject<Record<string, string>>(
    on(queryString, () => extractQuery(url())) as () => Record<string, string>
  );

  function redirect(
    mode: RouteUpdateMode,
    to: string,
    options: RedirectOptions = {
      resolve: false
    }
  ) {
    let resolvedTo: string | undefined;

    if (options.resolve) {
      const currentRoute = useRoute();
      if (currentRoute) {
        resolvedTo = currentRoute.resolvePath(to);
      } else {
        resolvedTo = resolvePath(basePath!, to);
      }
    } else {
      resolvedTo = resolvePath("", to);
    }

    if (resolvedTo === undefined) {
      throw new Error(`Path '${path}' is not a routable path`);
    }

    const redirectCount = referrers.push({
      ref: untrack(reference),
      mode
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
    base: basePath,
    location: {
      get path() {
        return path();
      },
      get queryString() {
        return queryString();
      }
    },
    query,
    isRouting,
    utils,
    push(to, options) {
      redirect("push", to, options);
    },
    replace(to, options) {
      redirect("replace", to, options);
    }
  };
}

export function createRouteState(
  router: RouterState,
  parent: RouteState,
  child: () => RouteState,
  match: () => MatchedRoute
): RouteState {
  const { route } = match();
  const path = createMemo(() => match().path);
  const params = createMemoObject<Record<string, string>>(
    on(path, () => match().params) as () => Record<string, string>
  );

  const routeState: RouteState = {
    parent,
    pattern: route.pattern,
    get child() {
      return child();
    },
    get path() {
      return path();
    },
    params,
    outlet() {
      return route.element(routeState, router);
    },
    resolvePath(to: string) {
      return resolvePath(router.base, to, path());
    }
  };

  if (route.data) {
    routeState.data = route.data(routeState, router);
  }

  return routeState;
}
