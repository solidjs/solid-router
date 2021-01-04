import {
  createContext,
  useContext,
  Component,
  createSignal,
  createMemo,
  untrack,
  useTransition,
  splitProps,
  JSX
} from "solid-js";
import { Show, assignProps, isServer } from "solid-js/web";
import { RouteRecognizer, Route as RouteDef } from "./recognizer";
import type { BaseObject, Params, QueryParams, RecognizeResults } from "./recognizer";

export { parseQueryString, generateQueryString } from "./recognizer";
export type { Params } from "./recognizer";

export type DataFnParams<T> = { params: Params<T>; query: QueryParams };
export type DataFn<T = BaseObject> = (props: DataFnParams<T>) => BaseObject;

export interface LinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  external?: boolean;
}

export interface RouteDefinition {
  path: string;
  component: Component<any>;
  data?: DataFn;
  children?: RouteDefinition[];
}

interface RouteHandler {
  component: Component<any>;
  data?: DataFn;
}

interface Router {
  location: string;
  current: RecognizeResults<RouteHandler> | undefined;
  pending: boolean;
  push: (p: string) => void;
  root: string;
  addRoutes: (r: RouteDefinition[]) => void;
}

const RouterContext = createContext<Router & { level: number }>();

export function useRouter() {
  return useContext(RouterContext);
}

export function Route<T extends { children?: any }>(props: T) {
  const router = useRouter(),
    childRouter = assignProps({}, router, { level: router.level + 1 }),
    [p, others] = splitProps(props, ["children"]),
    component = createMemo(
      () => {
        const resolved = router.current;
        return resolved && resolved[router.level] && resolved[router.level].handler.component;
      },
      undefined,
      true
    ),
    params = createMemo(
      () => {
        const resolved = router.current;
        return resolved && resolved[router.level] && resolved[router.level].params;
      },
      undefined,
      true
    ),
    query = createMemo(
      () => {
        const resolved = router.current;
        return resolved && resolved.queryParams;
      },
      undefined,
      true
    ),
    data = () => {
      const resolved = router.current;
      return (
        (resolved &&
          resolved[router.level].handler.data &&
          resolved[router.level].handler.data!({
            get params() {
              return params()!;
            },
            get query() {
              return query()!;
            }
          })) ||
        {}
      );
    };

  return (
    <RouterContext.Provider value={childRouter}>
      <Show when={component()}>
        {(C: Component<any>) => {
          const d = untrack(data);
          return (
            <C params={params()} query={query()} {...d} {...others}>
              {p.children}
            </C>
          );
        }}
      </Show>
    </RouterContext.Provider>
  );
}

export const Link: Component<LinkProps> = props => {
  const router = useRouter(),
    [p, others] = splitProps(props, ["children", "external"]);
  return (
    <a
      {...others}
      onClick={e => {
        if (p.external) return;
        e.preventDefault();
        router.push(props.href || "");
      }}
    >
      {p.children}
    </a>
  );
};

export const Router: Component<{
  routes: RouteDefinition[];
  initialURL?: string;
  root?: string;
}> = props => {
  const router: Router & { level?: number } = createRouter(
    props.routes,
    props.initialURL,
    props.root
  );
  router.level = 0;
  return (
    <RouterContext.Provider value={router as Router & { level: number }}>
      {props.children}
    </RouterContext.Provider>
  );
};

function createRouter(routes: RouteDefinition[], initialURL?: string, root: string = ""): Router {
  const recognizer = new RouteRecognizer<RouteHandler>();
  processRoutes(recognizer, routes, root);

  const [location, setLocation] = createSignal(
    initialURL ? initialURL : window.location.pathname.replace(root, "") + window.location.search
  );
  const current = createMemo(() => recognizer.recognize(root + location()));
  const [pending, start] = useTransition();
  !isServer &&
    (window.onpopstate = () =>
      start(() => setLocation(window.location.pathname.replace(root, ""))));

  return {
    root,
    get location() {
      return location();
    },
    get current() {
      return current();
    },
    get pending() {
      return pending();
    },
    push(path) {
      window.history.pushState("", "", root + path);
      start(() => setLocation(path));
    },
    addRoutes(routes: RouteDefinition[]) {
      processRoutes(recognizer, routes, root);
    }
  };
}

function processRoutes(
  router: RouteRecognizer<RouteHandler>,
  routes: RouteDefinition[],
  root: string,
  parentRoutes: RouteDef<RouteHandler>[] = []
) {
  routes.forEach(r => {
    const mapped: RouteDef<RouteHandler> = {
      path: root + r.path,
      handler: { component: r.component, data: r.data }
    };
    if (!r.children) return router.add([...parentRoutes, mapped]);
    processRoutes(router, r.children, root, [...parentRoutes, mapped]);
  });
}
