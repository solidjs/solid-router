import { JSX, Show, createMemo, on, createRoot, mergeProps, splitProps, Component } from "solid-js";
import {
  RouteContext,
  RouterContext,
  createRouteState,
  createRouterState,
  useRoute,
  useRouter,
  createRoutes,
  getMatches,
  useResolvedPath
} from "./routing";
import {
  RouteData,
  RouteDefinition,
  RouterIntegration,
  RouterState,
  RouteState,
  RouteUpdateSignal
} from "./types";
import { createLocationMatcher, joinPaths } from "./utils";
import { pathIntegration } from "./integration";

export interface RouterProps {
  source?: RouterIntegration | RouteUpdateSignal;
  base?: string;
  children: JSX.Element;
}

export const Router = (props: RouterProps) => {
  const routerState = createRouterState(props.source || pathIntegration(), props.base);

  return <RouterContext.Provider value={routerState}>{props.children}</RouterContext.Provider>;
};

export interface RoutesProps {
  base?: string;
  fallback?: JSX.Element;
  children: JSX.Element;
}

export const Routes = (props: RoutesProps) => {
  const router = useRouter();
  const parentRoute = useRoute();

  const basePath = createMemo(() =>
    joinPaths(parentRoute ? parentRoute.path : router.base, props.base || "")
  );
  const routes = createMemo(() => createRoutes(props.children as any, basePath()));
  const matches = createMemo(() =>
    getMatches(routes(), router.location.path, parentRoute ? parentRoute.params : {})
  );

  const disposers: (() => void)[] = [];
  const routeStates = createMemo(
    on(matches, (nextMatches, prevMatches, prev) => {
      let equal = prevMatches && nextMatches.length === prevMatches.length;
      const next: RouteState[] = [];
      for (let i = 0, len = nextMatches.length; i < len; i++) {
        const prevMatch = prevMatches?.[i];
        const nextMatch = nextMatches[i];

        if (prev && prevMatch && nextMatch.route.pattern === prevMatch.route.pattern) {
          next[i] = prev[i];
        } else {
          equal = false;
          if (disposers[i]) {
            disposers[i]();
          }

          console.log(
            `creating new route state for '${matches()[i].route.pattern}' == '${
              nextMatch.route.pattern
            }`
          );

          createRoot(dispose => {
            disposers[i] = () => {
              console.log(`disposing route ${nextMatch.route.pattern}`);
              dispose();
            };
            next[i] = createRouteState(
              router,
              next[i - 1] || parentRoute,
              () => routeStates()[i + 1],
              () => matches()[i]
            );
          });
        }
      }

      disposers.splice(nextMatches.length).forEach(dispose => {
        dispose();
      });

      return prev && equal ? prev : next;
    }) as (prevValue?: RouteState[]) => RouteState[]
  );

  return (
    <Show when={routeStates()[0]} fallback={props.fallback}>
      {route => <RouteContext.Provider value={route}>{route.outlet()}</RouteContext.Provider>}
    </Show>
  );
};

export const useRoutes = (routes: RouteDefinition | RouteDefinition[], base?: string) => {
  return () => <Routes base={base}>{routes as any}</Routes>;
};

interface RouteProps {
  path: string;
  element?: JSX.Element | Component;
  children?: JSX.Element;
  data?: (route: RouteState, router: RouterState) => RouteData | undefined | void;
}

export const Route = (props: RouteProps) => {
  return props as unknown as JSX.Element;
};

export const Outlet = () => {
  const route = useRoute();
  return (
    <Show when={route?.child}>
      {route => <RouteContext.Provider value={route}>{route.outlet()}</RouteContext.Provider>}
    </Show>
  );
};

interface LinkBaseProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string | undefined;
}

function LinkBase(props: LinkBaseProps) {
  const [, rest] = splitProps(props, ["children", "to", "href", "onClick"]);
  const router = useRouter();
  const href = createMemo(() =>
    props.to !== undefined ? router.utils.renderPath(props.to) : props.href
  );

  const handleClick: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = evt => {
    const { onClick, to, target } = props;
    if (typeof onClick === "function") {
      onClick(evt);
    } else if (onClick) {
      onClick[0](onClick[1], evt);
    }
    if (
      to !== undefined &&
      !evt.defaultPrevented &&
      evt.button === 0 &&
      (!target || target === "_self") &&
      !(evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey)
    ) {
      evt.preventDefault();
      router.push(to, { resolve: false });
    }
  };

  return (
    <a {...rest} href={href()} onClick={handleClick}>
      {props.children}
    </a>
  );
}

export interface LinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  noResolve?: boolean;
}

export function Link(props: LinkProps) {
  const to = createMemo(() => (props.noResolve ? props.href : useResolvedPath(props.href)));

  return <LinkBase {...props} to={to()} />;
}

export interface NavLinkProps extends LinkProps {
  activeClass?: string;
  end?: boolean;
}

export function NavLink(props: NavLinkProps) {
  props = mergeProps({ activeClass: "is-active" }, props);
  const [, rest] = splitProps(props, ["activeClass", "end"]);
  const router = useRouter();

  const to = createMemo(() => (props.noResolve ? props.href : useResolvedPath(props.href)));
  const matcher = createMemo(() => {
    const path = to();
    return path !== undefined ? createLocationMatcher(path, props.end) : undefined;
  });
  const isActive = createMemo(() => {
    const m = matcher();
    return m && !!m(router.location.path);
  });

  return (
    <LinkBase
      {...rest}
      to={to()}
      classList={{ [props.activeClass!]: isActive() }}
      aria-current={isActive() ? "page" : undefined}
    />
  );
}

export interface RedirectProps {
  href: ((router: RouterState) => string) | string;
  noResolve?: boolean;
}

export function Redirect(props: RedirectProps) {
  const router = useRouter();
  const href = props.href;
  const path = typeof href === "function" ? href(router) : href;
  router.replace(path, { resolve: !props.noResolve });
  return null;
}
