/*@refresh skip*/

import type { Component, JSX, Owner } from "solid-js";
import { type RequestEvent, getRequestEvent, isServer } from "solid-js/web";
import {
  children,
  createMemo,
  createRoot,
  getOwner,
  mergeProps,
  on,
  Show,
  untrack
} from "solid-js";
import {
  createBranches,
  createRouteContext,
  createRouterContext,
  getRouteMatches,
  RouteContextObj,
  RouterContextObj
} from "../routing.js";
import type {
  MatchFilters,
  Params,
  RouteContext,
  RouteLoadFunc,
  RouteDefinition,
  RouterIntegration,
  RouterContext,
  Branch,
  RouteSectionProps,
  Location
} from "../types.js";
import { createMemoObject } from "../utils.js";

export type BaseRouterProps = {
  base?: string;
  /**
   * A component that wraps the content of every route.
   */
  root?: Component<RouteSectionProps>;
  rootLoad?: RouteLoadFunc;
  singleFlight?: boolean;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
};

export const createRouterComponent = (router: RouterIntegration) => (props: BaseRouterProps) => {
  const { base } = props;
  const routeDefs = children(() => props.children as JSX.Element) as unknown as () =>
    | RouteDefinition
    | RouteDefinition[];

  const branches = createMemo(() => createBranches(routeDefs(), props.base || ""));
  let context: Owner;
  const routerState = createRouterContext(router, () => context, branches, {
    base,
    singleFlight: props.singleFlight
  });
  const location = routerState.location;
  router.create && router.create(routerState);

  return (
    <RouterContextObj.Provider value={routerState}>
      <Root location={location} root={props.root} load={props.rootLoad}>
        {(context = getOwner()!) && null}
        <Routes routerState={routerState} branches={branches()} />
      </Root>
    </RouterContextObj.Provider>
  );
};

function Root(props: {
  location: Location<unknown>;
  root?: Component<RouteSectionProps>;
  load?: RouteLoadFunc;
  children: JSX.Element;
}) {
  const location = props.location;
  const data = createMemo(
    () => props.load && untrack(() => props.load!({ params: {}, location, intent: "preload" }))
  );
  return (
    <Show when={props.root} keyed fallback={props.children}>
      {Root => (
        <Root params={{}} location={location} data={data()}>
          {props.children}
        </Root>
      )}
    </Show>
  );
}

function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
  const matches = createMemo(() =>
    getRouteMatches(props.branches, props.routerState.location.pathname)
  );

  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    e &&
      ((e.router || (e.router = {})).matches ||
        (e.router.matches = matches().map(({ route, path, params }) => ({
          path: route.originalPath,
          pattern: route.pattern,
          match: path,
          params,
          info: route.info
        }))));
  }
  const params = createMemoObject(() => {
    const m = matches();
    const params: Params = {};
    for (let i = 0; i < m.length; i++) {
      Object.assign(params, m[i].params);
    }
    return params;
  });
  const disposers: (() => void)[] = [];
  let root: RouteContext | undefined;

  const routeStates = createMemo(
    on(matches, (nextMatches, prevMatches, prev: RouteContext[] | undefined) => {
      let equal = prevMatches && nextMatches.length === prevMatches.length;
      const next: RouteContext[] = [];
      for (let i = 0, len = nextMatches.length; i < len; i++) {
        const prevMatch = prevMatches && prevMatches[i];
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
              createOutlet(() => routeStates()[i + 1]),
              () => matches()[i],
              params
            );
          });
        }
      }

      disposers.splice(nextMatches.length).forEach(dispose => dispose());

      if (prev && equal) {
        return prev;
      }
      root = next[0];
      return next;
    })
  );
  return createOutlet(() => routeStates() && root)();
}

const createOutlet = (child: () => RouteContext | undefined) => {
  return () => (
    <Show when={child()} keyed>
      {child => <RouteContextObj.Provider value={child}>{child.outlet()}</RouteContextObj.Provider>}
    </Show>
  );
};

export type RouteProps<S extends string, T = unknown> = {
  path?: S | S[];
  children?: JSX.Element;
  load?: RouteLoadFunc<T>;
  matchFilters?: MatchFilters<S>;
  component?: Component<RouteSectionProps<T>>;
  info?: Record<string, any>;
};

export const Route = <S extends string, T = unknown>(props: RouteProps<S, T>) => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
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
    route.load &&
      route.load({
        params,
        location: routerState.location,
        intent: "preload"
      });
  }
}
