/*@refresh skip*/

import type { Component, JSX } from "solid-js";
import {
  children,
  createMemo,
  createRoot,
  mergeProps,
  on,
  onCleanup,
  Show,
  splitProps
} from "solid-js";
import { isServer } from "solid-js/web";
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
  useResolvedPath,
  useRoute,
  useRouter
} from "./routing";
import type {
  LinkPreloadOpts,
  Location,
  LocationChangeSignal,
  MatchFilters,
  Navigator,
  Params,
  RouteContext,
  RouteDataFunc,
  RouteDefinition,
  RouterIntegration
} from "./types";
import { joinPaths, normalizePath, createMemoObject, composeEventHandlers } from "./utils";

declare module "solid-js" {
  namespace JSX {
    interface AnchorHTMLAttributes<T> {
      state?: string;
      noScroll?: boolean;
      replace?: boolean;
      link?: boolean;
    }
  }
}

export type RouterProps = {
  base?: string;
  data?: RouteDataFunc;
  children: JSX.Element;
  out?: object;
  preload?: LinkPreloadOpts["preload"];
  preloadDelay?: LinkPreloadOpts["preloadDelay"];
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
  const { source, url, base, data, out, preload, preloadDelay } = props;
  const integration =
    source || (isServer ? staticIntegration({ value: url || "" }) : pathIntegration());
  const routerState = createRouterContext(integration, base, data, out, preload, preloadDelay);

  return (
    <RouterContextObj.Provider value={routerState}>{props.children}</RouterContextObj.Provider>
  );
};

export interface RoutesProps {
  base?: string;
  children: JSX.Element;
}

export const Routes = (props: RoutesProps) => {
  const router = useRouter();
  const parentRoute = useRoute();
  const routeDefs = children(() => props.children) as unknown as () =>
    | RouteDefinition
    | RouteDefinition[];

  const branches = createMemo(() =>
    createBranches(routeDefs(), joinPaths(parentRoute.pattern, props.base || ""), Outlet)
  );
  const matches = createMemo(() => getRouteMatches(branches(), router.location.pathname));
  const params = createMemoObject(() => {
    const m = matches();
    const params: Params = {};
    for (let i = 0; i < m.length; i++) {
      Object.assign(params, m[i].params);
    }
    return params;
  });

  if (router.out) {
    router.out.matches.push(
      matches().map(({ route, path, params }) => ({
        originalPath: route.originalPath,
        pattern: route.pattern,
        path,
        params
      }))
    );
  }

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
              router,
              next[i - 1] || parentRoute,
              () => routeStates()[i + 1],
              () => matches()[i],
              params,
              branches
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
};

export const useRoutes = (
  routes: RouteDefinition | RouteDefinition[] | Readonly<RouteDefinition[]>,
  base?: string
) => {
  return () => <Routes base={base}>{routes as any}</Routes>;
};

export type RouteProps<S extends string> = {
  path: S | S[];
  children?: JSX.Element;
  data?: RouteDataFunc;
  matchFilters?: MatchFilters<S>;
} & (
  | {
      element?: never;
      component: Component;
    }
  | {
      component?: never;
      element?: JSX.Element;
      preload?: () => void;
    }
);

export const Route = <S extends string>(props: RouteProps<S>) => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    }
  }) as unknown as JSX.Element;
};

export const Outlet = () => {
  const route = useRoute();
  return (
    <Show when={route.child} keyed>
      {child => <RouteContextObj.Provider value={child}>{child.outlet()}</RouteContextObj.Provider>}
    </Show>
  );
};

export interface AnchorProps
  extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "state">,
    LinkPreloadOpts {
  href: string;
  replace?: boolean | undefined;
  noScroll?: boolean | undefined;
  state?: unknown | undefined;
  inactiveClass?: string | undefined;
  activeClass?: string | undefined;
  end?: boolean | undefined;
}
export function A(props: AnchorProps) {
  const router = useRouter();
  const preloadFn = router.preloadFactory();
  const defaultPreload = router.preload ?? false;
  const defaultPreloadDelay = router.preloadDelay ?? 0;

  props = mergeProps(
    {
      inactiveClass: "inactive",
      activeClass: "active",
      preload: defaultPreload,
      preloadDelay: defaultPreloadDelay
    },
    props
  );
  const [, rest] = splitProps(props, [
    "href",
    "state",
    "class",
    "activeClass",
    "inactiveClass",
    "end",
    "preload",
    "preloadDelay",
    "onMouseEnter",
    "onFocus",
    "onMouseLeave",
    "onTouchStart"
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

  let preloadTimeout: ReturnType<typeof setTimeout> | null = null;

  const tryPreload = () => {
    if (!props.preload || preloadTimeout) return;

    preloadTimeout = setTimeout(() => {
      preloadTimeout = null;
      preloadFn(props.href);
    }, props.preloadDelay);
  };

  const handleFocus = (e: MouseEvent) => {
    tryPreload();
  };

  const handleEnter = () => {
    tryPreload();
  };

  const handleTouchStart = () => {
    if (!props.preload || preloadTimeout) return;
    // Never delay for touch intention
    preloadFn(props.href);
  };

  const handleLeave = (e: MouseEvent) => {
    if (preloadTimeout) {
      clearTimeout(preloadTimeout);
      preloadTimeout = null;
    }
  };

  onCleanup(() => {
    if (preloadTimeout) {
      clearTimeout(preloadTimeout);
    }
  });

  return (
    <a
      link
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
      onFocus={composeEventHandlers([props.onFocus, handleFocus])}
      onMouseEnter={composeEventHandlers([props.onMouseEnter, handleEnter])}
      onMouseLeave={composeEventHandlers([props.onMouseLeave, handleLeave])}
      onTouchStart={composeEventHandlers([props.onTouchStart, handleTouchStart])}
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
