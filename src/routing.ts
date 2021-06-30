import { createContext, createMemo, JSX, untrack, useContext } from "solid-js";
import type {
  Route,
  MatchedRoute,
  RouterState,
  RouteState,
  RouteDefinition,
  Params
} from "./types";
import { createMatcher, createPath, extractQuery, invariant, toArray, resolvePath } from "./utils";

export const RouterContext = createContext<RouterState>();
export const RouteContext = createContext<RouteState>({
  pattern: "/",
  path: "/",
  params: {},
  outlet: null,
  resolvePath(v) {
    return v;
  }
});

export const useRouter = () =>
  invariant(useContext(RouterContext), "Make sure your app is wrapped in a <Router />");

export const useRoute = () => useContext(RouteContext);

export function createRoutes(routes: RouteDefinition | RouteDefinition[], base: string): Route[] {
  return toArray(routes).map<Route>((route, i, arr) => {
    const { children } = route;
    const path = createPath(route.path, base, !!children);

    return {
      originalPath: route.path,
      pattern: path,
      element: (router, context) => {
        const { element } = route;
        // In the case no element was defined on the <Route>, default to the route's outlet
        if (element === undefined) {
          return context.outlet;
        }
        // Allow render function with easy access to router and the route context
        if (typeof element === "function" && element.length) {
          return element(router, context);
        }
        return element as JSX.Element;
      },
      matcher: createMatcher(path, arr.length - i),
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

export function createRouterState(
  integration: [() => string, (v: string) => void],
  base: string = ""
): RouterState {
  const [source, setSource] = integration;

  const url = createMemo<URL>(
    prev => {
      try {
        return new URL(source(), "http://origin");
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
  const query = createMemo(() => {
    queryString();
    return untrack(() => extractQuery(url()));
  });

  return {
    base,
    location: {
      get path() {
        return path();
      },
      get queryString() {
        return queryString();
      }
    },
    get query() {
      return query();
    }
  };
}

export function createRouteState(
  router: RouterState,
  match: () => MatchedRoute,
  outlet: () => JSX.Element
): RouteState {
  const pattern = createMemo(() => match().route.pattern);
  const path = createMemo(() => match().path);
  const params = createMemo(() => match().params);

  return {
    get pattern() {
      return pattern();
    },
    get path() {
      return path();
    },
    get params() {
      return params();
    },
    outlet,
    resolvePath(to: string) {
      return resolvePath(router.base, path(), to);
    }
  };
}
