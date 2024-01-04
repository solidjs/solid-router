/*@refresh skip*/

import type { Component, JSX } from "solid-js";
import { getRequestEvent, isServer } from "solid-js/web";
import { children, createMemo, createRoot, mergeProps, on, Show } from "solid-js";
import {
  createBranches,
  createRouteContext,
  createRouterContext,
  getRouteMatches,
  RouteContextObj,
  RouterContextObj
} from "../routing";
import type {
  MatchFilters,
  Params,
  RouteContext,
  RouteLoadFunc,
  RouteDefinition,
  RouterIntegration,
  RouterContext,
  Branch,
  RouteSectionProps
} from "../types";
import { createMemoObject } from "../utils";

export type BaseRouterProps = {
  base?: string;
  /**
   * A component that wraps the content of every route.
   */
  root?: Component<RouteSectionProps>;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
};

export const createRouterComponent = (router: RouterIntegration) => (props: BaseRouterProps) => {
  const { base } = props;
  const routeDefs = children(() => props.children as JSX.Element) as unknown as () =>
    | RouteDefinition
    | RouteDefinition[];

  const branches = createMemo(() =>
    createBranches(
      props.root ? { component: props.root, children: routeDefs() } : routeDefs(),
      props.base || ""
    )
  );
  const routerState = createRouterContext(router, branches, { base });
  router.create && router.create(routerState);

  return (
    <RouterContextObj.Provider value={routerState}>
      <Routes routerState={routerState} branches={branches()} />
    </RouterContextObj.Provider>
  );
};

function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
  const matches = createMemo(() =>
    getRouteMatches(props.branches, props.routerState.location.pathname)
  );

  if (isServer) {
    const e = getRequestEvent();
    e &&
      (e.routerMatches || (e.routerMatches = [])).push(
        matches().map(({ route, path, params }) => ({
          path: route.originalPath,
          pattern: route.pattern,
          match: path,
          params,
          metadata: route.metadata
        }))
      );
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
  return (
    <Show when={routeStates() && root} keyed>
      {route => <RouteContextObj.Provider value={route}>{route.outlet()}</RouteContextObj.Provider>}
    </Show>
  );
}

const createOutlet = (child: () => RouteContext | undefined) => {
  return () => (
    <Show when={child()} keyed>
      {child => <RouteContextObj.Provider value={child}>{child.outlet()}</RouteContextObj.Provider>}
    </Show>
  );
};

export type RouteProps<S extends string, T=unknown> = {
  path?: S | S[];
  children?: JSX.Element;
  load?: RouteLoadFunc<T>;
  matchFilters?: MatchFilters<S>;
  component?: Component<RouteSectionProps<T>>;
  metadata?: Record<string, any>;
};

export const Route = <S extends string, T = unknown>(props: RouteProps<S, T>) => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    }
  }) as unknown as JSX.Element;
};
