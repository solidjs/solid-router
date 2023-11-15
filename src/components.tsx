/*@refresh skip*/

import type { Component, JSX } from "solid-js";
import { children, createMemo, createRoot, mergeProps, on, Show, splitProps } from "solid-js";
import { isServer, getRequestEvent } from "solid-js/web";
import { pathIntegration, staticIntegration } from "./integration";
import {
  createBranches,
  createRouteContext,
  createRouterContext,
  getRouteMatches,
  RouteContextObj,
  RouterContextObj,
  useHref,
  useLocation,
  useNavigate,
  useResolvedPath
} from "./routing";
import type {
  Location,
  LocationChangeSignal,
  MatchFilters,
  Navigator,
  Params,
  RouteContext,
  RouteLoadFunc,
  RouteDefinition,
  RouterIntegration,
  RouterContext,
  Branch,
  RouteSectionProps
} from "./types";
import { normalizePath, createMemoObject } from "./utils";

declare module "solid-js" {
  namespace JSX {
    interface AnchorHTMLAttributes<T> {
      state?: string;
      noScroll?: boolean;
      replace?: boolean;
      preload?: boolean;
    }
  }
}

export type RouterProps = {
  base?: string;
  root?: Component<RouteSectionProps>;
  children: JSX.Element;
} & (
  | {
      url?: never;
      source?: RouterIntegration | LocationChangeSignal;
    }
  | {
      source?: never;
      url: string;
    }
);

export const Router = (props: RouterProps) => {
  let e: any;
  const { source, url, base } = props;
  const integration =
    source ||
    (isServer
      ? staticIntegration({ value: url || ((e = getRequestEvent()) && e.request.url) || "" })
      : pathIntegration());

  const routeDefs = children(() =>
    props.root
      ? {
          component: props.root,
          children: props.children
        } as unknown as JSX.Element
      : props.children
  ) as unknown as () => RouteDefinition | RouteDefinition[];

  const branches = createMemo(() => createBranches(routeDefs(), props.base || ""));
  const routerState = createRouterContext(integration, branches, base);

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

export type RouteProps<S extends string> = {
  path?: S | S[];
  children?: JSX.Element;
  load?: RouteLoadFunc;
  matchFilters?: MatchFilters<S>;
  component?: Component;
};

export const Route = <S extends string>(props: RouteProps<S>) => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    }
  }) as unknown as JSX.Element;
};

export interface AnchorProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "state"> {
  href: string;
  replace?: boolean | undefined;
  noScroll?: boolean | undefined;
  state?: unknown | undefined;
  inactiveClass?: string | undefined;
  activeClass?: string | undefined;
  end?: boolean | undefined;
}
export function A(props: AnchorProps) {
  props = mergeProps({ inactiveClass: "inactive", activeClass: "active" }, props);
  const [, rest] = splitProps(props, [
    "href",
    "state",
    "class",
    "activeClass",
    "inactiveClass",
    "end"
  ]);
  const to = useResolvedPath(() => props.href);
  const href = useHref(to);
  const location = useLocation();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return false;
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase();
    const loc = normalizePath(location.pathname).toLowerCase();
    return props.end ? path === loc : loc.startsWith(path);
  });

  return (
    <a
      {...rest}
      href={href() || props.href}
      state={JSON.stringify(props.state)}
      classList={{
        ...(props.class && { [props.class]: true }),
        [props.inactiveClass!]: !isActive(),
        [props.activeClass!]: isActive(),
        ...rest.classList
      }}
      aria-current={isActive() ? "page" : undefined}
    />
  );
}
// deprecated alias exports
export { A as Link, A as NavLink, AnchorProps as LinkProps, AnchorProps as NavLinkProps };
export interface NavigateProps {
  href: ((args: { navigate: Navigator; location: Location }) => string) | string;
  state?: unknown;
}

export function Navigate(props: NavigateProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { href, state } = props;
  const path = typeof href === "function" ? href({ navigate, location }) : href;
  navigate(path, { replace: true, state });
  return null;
}
