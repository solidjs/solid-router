import {
  createContext,
  useContext,
  Component,
  createSignal,
  createMemo,
  useTransition,
  JSX,
  createComputed,
  batch,
  onCleanup,
  createRoot
} from "solid-js";
import { SetStoreFunction, createStore } from "solid-js/store";
import { Show, mergeProps, isServer } from "solid-js/web";
import { RouteRecognizer, Route as RouteDef } from "./recognizer";
import type { BaseObject, Params, QueryParams, RecognizeResults } from "./recognizer";

export { parseQueryString, generateQueryString } from "./recognizer";
export type { Params, QueryParams } from "./recognizer";

export type DataFnParams<T> = {
  params: Params<T>;
  query: QueryParams;
  root: string;
  location: string;
  pending: boolean;
  level: number;
};
export type DataFn<T = BaseObject> = (
  routerState: DataFnParams<T>,
  routerActions: RouterActions
) => BaseObject;

export interface LinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
}

export interface NavLinkProps extends LinkProps {
  activeClass?: string;
  exact?: boolean;
}

export interface RouteDefinition {
  path: string;
  component: Component<any>;
  data?: DataFn;
  children?: RouteDefinition[];
}

interface RouteHandler {
  component: Component<any> & { preload?: () => Promise<any> };
  data?: DataFn;
}

interface Router {
  location: string;
  current: RecognizeResults<RouteHandler>;
  params: Params;
  query: QueryParams;
  pending: boolean;
  root: string;
  level: number;
  data: unknown[];
}
interface RouterActions {
  push: (p: string) => void;
  replace: (p: string) => void;
  back: () => void;
  isActive: (url: string, exact?: boolean) => boolean;
  addRoutes: (r: RouteDefinition[]) => void;
}

const RouterContext = createContext<[Router, RouterActions]>();

export function useRouter() {
  return useContext(RouterContext);
}

export function Route<T>(props: T) {
  const [router, actions] = useRouter()!,
    childRouter = mergeProps(router, { level: router.level + 1 }),
    component = createMemo(() => {
      const resolved = router.current;
      return resolved[router.level] && resolved[router.level].handler.component;
    });

  return (
    <RouterContext.Provider value={[childRouter, actions]}>
      <Show when={component()}>
        {(C: Component<any>) => {
          return (
            <C
              params={router.params}
              query={router.query}
              {...router.data[router.level]}
              {...props}
            >
              <Route />
            </C>
          );
        }}
      </Show>
    </RouterContext.Provider>
  );
}

export const Link: Component<LinkProps> = props => {
  const [router, { push }] = useRouter()!;
  return (
    <a
      {...props}
      href={router.root + props.href}
      onClick={e => {
        if (
          props.external ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          e.shiftKey ||
          e.button ||
          e.defaultPrevented
        )
          return;
        e.preventDefault();
        push(props.href || "");
      }}
    >
      {props.children}
    </a>
  );
};

export const NavLink: Component<NavLinkProps> = props => {
  const [, { isActive }] = useRouter()!;
  return (
    <Link
      {...props}
      classList={{ [props.activeClass || "active"]: isActive(props.href, props.exact) }}
    >
      {props.children}
    </Link>
  );
};

export const Router: Component<{
  routes: RouteDefinition[];
  initialURL?: string;
  root?: string;
  out?: any;
}> = props => {
  const router = createRouter(props.routes, props.initialURL, props.root);
  props.out && (props.out.router = router);
  return <RouterContext.Provider value={router}>{props.children}</RouterContext.Provider>;
};

function shallowDiff(prev: Params, next: Params, set: SetStoreFunction<any>, key: string) {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  for (let i = 0; i < prevKeys.length; i++) {
    const k = prevKeys[i];
    if (next[k] == null) set(key, k, undefined as any);
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const k = nextKeys[i];
    if (next[k] !== prev[k]) set(key, k, next[k] as any);
  }
  return { ...next };
}

function createRouter(
  routes: RouteDefinition[],
  initialURL?: string,
  root: string = ""
): [Router, RouterActions] {
  const recognizer = new RouteRecognizer<RouteHandler>();
  processRoutes(recognizer, routes, root);

  const [location, setLocation] = createSignal(
    initialURL ? initialURL : window.location.pathname.replace(root, "") + window.location.search
  );
  const current = createMemo(
    () =>
      recognizer.recognize(root + location()) || ([] as unknown as RecognizeResults<RouteHandler>)
  );
  const data: unknown[] = [];
  const [pending, start] = useTransition();
  const [routeState, setRouteState] = createStore({
    params: {},
    query: {}
  });
  const state = {
    root,
    get location() {
      return location();
    },
    get pending() {
      return pending();
    },
    get params() {
      return routeState.params;
    },
    get query() {
      return routeState.query;
    },
    level: 0
  };
  // make it non-enumerable
  Object.defineProperties(state, {
    current: {
      get() {
        return current();
      }
    },
    data: {
      value: data
    }
  });
  const actions: RouterActions = {
    push(path) {
      window.history.pushState("", "", root + path);
      start(
        () => setLocation(path),
        () => window.scrollTo(0, 0)
      );
    },
    replace(path) {
      window.history.replaceState("", "", root + path);
      start(
        () => setLocation(path),
        () => window.scrollTo(0, 0)
      );
    },
    back() {
      window.history.back();
      start(() => setLocation(window.location.pathname.replace(root, "") + window.location.search));
    },
    addRoutes(routes: RouteDefinition[]) {
      processRoutes(recognizer, routes, root);
    },
    isActive(url: string, exact = false) {
      let ref;
      return (
        state.location.startsWith(url) &&
        (!exact || (ref = state.location[url.length]) === undefined || ref === "?")
      );
    }
  };
  createComputed(
    prev => {
      const newQuery = current().queryParams || {};
      const newParams = current().reduce((memo, item) => Object.assign(memo, item.params), {});
      return batch(() => ({
        query: shallowDiff(prev.query, newQuery, setRouteState, "query"),
        params: shallowDiff(prev.params, newParams, setRouteState, "params")
      }));
    },
    { query: {}, params: {} }
  );
  const disposers: (() => void)[] = [];
  onCleanup(() => {
    for (let i = 0, len = disposers.length; i < len; i++) disposers[i]();
  });
  createComputed(prevLevels => {
    const levels = current();
    let i = 0;
    function mapFn(dispose: () => void) {
      disposers[i] = dispose;
      return levels[i].handler.data!(state, actions);
    }
    while (
      prevLevels[i] &&
      levels[i] &&
      prevLevels[i].handler.component === levels[i].handler.component &&
      prevLevels[i].handler.data === levels[i].handler.data
    )
      i++;
    for (let j = i; j < prevLevels.length; j++) {
      disposers[j] && disposers[j]();
    }
    for (; i < levels.length; i++) {
      if (levels[i].handler.component.preload) levels[i].handler.component.preload!();
      if (levels[i].handler.data) {
        data[i] = createRoot(mapFn);
      } else data[i] = {};
    }
    return [...levels] as RecognizeResults<RouteHandler>;
  }, [] as unknown as RecognizeResults<RouteHandler>);
  !isServer &&
    (window.onpopstate = () =>
      start(() =>
        setLocation(window.location.pathname.replace(root, "") + window.location.search)
      ));

  return [state as Router, actions];
}

function processRoutes(
  router: RouteRecognizer<RouteHandler>,
  routes: RouteDefinition[],
  root: string,
  parentRoutes: RouteDef<RouteHandler>[] = []
) {
  let noIndex = !routes.find(r => r.path === "/");
  routes.forEach(r => {
    const mapped: RouteDef<RouteHandler> = {
      path: root + r.path,
      handler: { component: r.component, data: r.data }
    };
    if (!r.children) {
      if (noIndex && (r.path[0] === "*" || r.path[1] === "*")) {
        router.add([...parentRoutes, { ...mapped, path: `${root}/`, alias: mapped.path }]);
        noIndex = false;
      }
      router.add([...parentRoutes, mapped]);
      return;
    }
    processRoutes(router, r.children, "", [...parentRoutes, mapped]);
  });
}
