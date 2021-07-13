import { JSX, Show, createMemo, on, createRoot, mergeProps, splitProps, Component } from "solid-js";
import { isServer } from "solid-js/web"
import {
  RouteContext,
  RouterContext,
  createRouteState,
  createRouterState,
  useRoute,
  useRouter,
  createRoutes,
  getMatches,
  useResolvedPath,
  useLocation,
  useNavigate,
  useHref,
  useParams
} from "./routing";
import {
  Location,
  Navigate,
  RouteData,
  RouteUpdate,
  RouteDefinition,
  RouterIntegration,
  RouterState,
  RouteState,
  RouteUpdateSignal
} from "./types";
import { pathIntegration } from "./integration";

export interface RouterProps {
  source?: RouterIntegration | RouteUpdateSignal;
  url?: string;
  context?: object;
  base?: string;
  children: JSX.Element;
}


const staticIntegration = (obj: RouteUpdate): RouteUpdateSignal => [() => obj, (next) => obj.value = next.value];

export const Router = (props: RouterProps) => {
  const integration = props.source || (isServer ? staticIntegration({ value: props.url! }) : pathIntegration())
  const routerState = createRouterState(integration, props.base);

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
  const location = useLocation();

  const basePath = useResolvedPath(() => props.base || "");
  const routes = createMemo(() => createRoutes(props.children as any, basePath() || "", Outlet));
  const matches = createMemo(() => getMatches(routes(), location.pathname));

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

          // console.log(
          //   `creating new route state for '${matches()[i].route.pattern}' == '${
          //     nextMatch.route.pattern
          //   }`
          // );

          createRoot(dispose => {
            disposers[i] = () => {
              // console.log(`disposing route ${nextMatch.route.pattern}`);
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
  const navigate = useNavigate();
  const href = useHref(() => props.to);

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
      navigate(to, { resolve: false });
    }
  };

  return (
    <a {...rest} href={href() ?? props.href} onClick={handleClick}>
      {props.children}
    </a>
  );
}

export interface LinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export function Link(props: LinkProps) {
  const to = useResolvedPath(() => props.href);
  return <LinkBase {...props} to={to()} />;
}

export interface NavLinkProps extends LinkProps {
  activeClass?: string;
  end?: boolean;
}

export function NavLink(props: NavLinkProps) {
  props = mergeProps({ activeClass: "is-active" }, props);
  const [, rest] = splitProps(props, ["activeClass", "end"]);
  const location = useLocation();
  const to = useResolvedPath(() => props.href);
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) {
      return false;
    }
    const path = to_.split(/[?#]/, 1)[0].toLowerCase();
    const loc = location.pathname.toLowerCase();
    return props.end ? path === loc : loc.startsWith(path);
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
  href: ((args: { navigate: Navigate; location: Location }) => string) | string;
}

export function Redirect(props: RedirectProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { href } = props;
  const path = typeof href === "function" ? href({ navigate, location }) : href;
  navigate(path, { replace: true });
  return null;
}
