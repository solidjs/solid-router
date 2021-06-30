import { JSX, createMemo, untrack } from "solid-js";
import {
  RouteContext,
  RouterContext,
  createRouteState,
  createRouterState,
  useRoute,
  useRouter,
  createRoutes,
  getMatches
} from "./routing";
import { MatchedRoute, RouteDefinition, RouteRenderFunc } from "./types";
import { joinPaths } from "./utils";

export interface RouterProps {
  source: [() => string, (next: string) => void];
  base?: string;
  children: JSX.Element;
}

export const Router = (props: RouterProps) => {
  const state = createRouterState(props.source, props.base);

  return <RouterContext.Provider value={state}>{props.children}</RouterContext.Provider>;
};

interface RouteElementProps {
  matches: MatchedRoute[];
}

const RouteElement = (props: RouteElementProps) => {
  const router = useRouter();

  const match = createMemo(() => props.matches[0]);
  const route = createMemo(() => match().route, undefined, {
    equals: (a, b) => a.pattern === b.pattern
  });
  const element = createMemo(() => route().element);
  const hasOutlet = createMemo(() => props.matches.length > 1);
  const outlet = createMemo(() =>
    hasOutlet() ? untrack(() => <RouteElement matches={props.matches.slice(1)} />) : null
  );

  const state = createRouteState(router, match, outlet);

  return <RouteContext.Provider value={state}>{element()(router, state)}</RouteContext.Provider>;
};

export interface RoutesProps {
  base?: string;
  children: JSX.Element;
}

export const Routes = (props: RoutesProps) => {
  const router = useRouter();
  const route = useRoute();

  const basePath = createMemo(() => joinPaths(route.path, props.base || ""));
  const routes = createMemo(() => createRoutes(props.children as any, basePath()));
  const matches = createMemo(() => getMatches(routes(), router.location.path, route.params));

  return <RouteElement matches={matches()} />;
};

export const useRoutes = (routes: RouteDefinition | RouteDefinition[], base?: string) => {
  return () => <Routes base={base}>{routes as any}</Routes>;
};

interface RouteProps {
  path: string;
  element: JSX.Element | RouteRenderFunc;
  children?: JSX.Element;
}

export const Route = (props: RouteProps) => {
  return props as unknown as JSX.Element;
};

export const Outlet = () => {
  return useRoute().outlet;
};
