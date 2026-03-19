/*@refresh skip*/

import type {Component, JSX, Owner} from "solid-js";
import {children, createMemo, createRoot, getOwner, merge, untrack} from "solid-js";
import {getRequestEvent, isServer, type RequestEvent} from "@solidjs/web";
import {
    createBranches,
    createRouteContext,
    createRouterContext,
    getIntent,
    getRouteMatches,
    RouteContextObj,
    RouterContextObj,
    setInPreloadFn
} from "../routing.js";
import type {
    Branch,
    MatchFilters,
    RouteContext,
    RouteDefinition,
    RouteMatch,
    RoutePreloadFunc,
    RouterContext,
    RouterIntegration,
    RouteSectionProps
} from "../types.js";

export type BaseRouterProps = {
  base?: string;
  /**
   * A component that wraps the content of every route.
   */
  root?: Component<RouteSectionProps>;
  rootPreload?: RoutePreloadFunc;
  singleFlight?: boolean;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
  transformUrl?: (url: string) => string;
};

export const createRouterComponent = (router: RouterIntegration) => function IntegratedRouter(props: BaseRouterProps) {
  const { base, singleFlight, transformUrl, root, rootPreload, routeChildren } = untrack(() => ({
    base: props.base,
    singleFlight: props.singleFlight,
    transformUrl: props.transformUrl,
    root: props.root,
    rootPreload: props.rootPreload,
    routeChildren: props.children
  }));
  const routeDefs = children(() => routeChildren as JSX.Element) as unknown as () =>
    | RouteDefinition
    | RouteDefinition[];

  const branches = createMemo(() => createBranches(routeDefs(), base || ""));
  let context: Owner;
  const routerState = createRouterContext(router, branches, () => context, {
    base,
    singleFlight,
    transformUrl,
  });
  router.create && router.create(routerState);
  return (
    <RouterContextObj value={routerState}>
      <Root routerState={routerState} root={root} preload={rootPreload}>
        {(context = getOwner()!) && null}
        <Routes routerState={routerState} branches={branches()} />
      </Root>
    </RouterContextObj>
  );
};

function Root(props: {
  routerState: RouterContext;
  root?: Component<RouteSectionProps>;
  preload?: RoutePreloadFunc;
  children: JSX.Element;
}) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(
    () =>
      props.preload &&
      untrack(() => {
        setInPreloadFn(true);
        props.preload!({ params, location, intent: getIntent() || "initial" });
        setInPreloadFn(false);
      })
  );
  const RootComp = props.root;
  if (RootComp) {
    return (
      <RootComp params={params} location={location} data={data()}>
        {props.children}
      </RootComp>
    );
  }
  return props.children;
}

function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    e &&
      ((e.router || (e.router = {})).matches ||
        (e.router.matches = props.routerState.matches().map(({ route, path, params }) => ({
          path: route.originalPath,
          pattern: route.pattern,
          match: path,
          params,
          info: route.info
        }))));
  }

  const disposers: (() => void)[] = [];
  let root: RouteContext | undefined;
  let prevMatches: RouteMatch[] | undefined;

  const routeStates = createMemo((prev: RouteContext[] | undefined) => {
      const nextMatches = props.routerState.matches();
      const previousMatches = prevMatches;
      let equal = previousMatches && nextMatches.length === previousMatches.length;
      const next: RouteContext[] = [];
      for (let i = 0, len = nextMatches.length; i < len; i++) {
        const prevMatch = previousMatches && previousMatches[i];
        const nextMatch = nextMatches[i];

        if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
          next[i] = prev[i];
        } else {
          equal = false;
          if (disposers[i]) {
            disposers[i]();
          }

          createRoot(dispose => {
            disposers[i] = dispose;
            next[i] = createRouteContext(
              props.routerState,
              next[i - 1] || props.routerState.base,
              createOutlet(() => routeStates()?.[i + 1]),
              () => {
                const routeMatches = props.routerState.matches();
                return routeMatches[i] ?? routeMatches[0];
              }
            );
          });
        }
      }

      disposers.splice(nextMatches.length).forEach(dispose => dispose());

      if (prev && equal) {
        prevMatches = nextMatches;
        return prev;
      }
      root = next[0];
      prevMatches = nextMatches;
      return next;
    }, undefined);
  const outlet = createOutlet(() => routeStates() && root);
  return <>{outlet()}</>;
}

const createOutlet = (child: () => RouteContext | undefined) => {
  return () => {
    const c = child();
    if (c) {
      return <RouteContextObj value={c}>{c.outlet()}</RouteContextObj>;
    }
    return undefined;
  };
};

export type RouteProps<S extends string, T = unknown> = {
  path?: S | S[];
  children?: JSX.Element;
  preload?: RoutePreloadFunc<T>;
  matchFilters?: MatchFilters<S>;
  component?: Component<RouteSectionProps<T>>;
  info?: Record<string, any>;
};

export const Route = <S extends string, T = unknown>(props: RouteProps<S, T>) => {
  const childRoutes = children(() => props.children);
  return merge(props, {
    get children() {
      return childRoutes();
    }
  }) as unknown as JSX.Element;
};

// for data only mode with single flight mutations
function dataOnly(event: RequestEvent, routerState: RouterContext, branches: Branch[]) {
  const url = new URL(event.request.url);
  const prevMatches = getRouteMatches(
    branches,
    new URL(event.router!.previousUrl || event.request.url).pathname
  );
  const matches = getRouteMatches(branches, url.pathname);
  for (let match = 0; match < matches.length; match++) {
    if (!prevMatches[match] || matches[match].route !== prevMatches[match].route)
      event.router!.dataOnly = true;
    const { route, params } = matches[match];
    route.preload &&
      route.preload({
        params,
        location: routerState.location,
        intent: "preload"
      });
  }
}
