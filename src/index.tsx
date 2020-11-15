import {
  createContext,
  useContext,
  Component,
  createSignal,
  createMemo,
  lazy,
  untrack,
  useTransition
} from "solid-js";
import { Show, assignProps, isServer } from "solid-js/web";
import {
  RecognizeResults,
  RouteRecognizer,
  Route as RouteDef,
  QueryParams,
  Params
} from "./recognizer";
export { parseQueryString, generateQueryString } from "./recognizer";

export interface RouteDefinition {
  path: string;
  component: string | Component<any>;
  data?: (props: { params: Params; query: QueryParams }) => Record<string, unknown>;
  children?: RouteDefinition[];
}

interface RouteHandler {
  component: Component<any>;
  data?: (props: { params: Params; query: QueryParams }) => Record<string, unknown>;
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

export function Route<T>(props: T) {
  const router = useRouter(),
    childRouter = assignProps({}, router, { level: router.level + 1 }),
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
          return <C params={params()} query={query()} {...d} {...props} />;
        }}
      </Show>
    </RouterContext.Provider>
  );
}

export const Link: Component<JSX.AnchorHTMLAttributes<HTMLAnchorElement>> = props => {
  const router = useRouter();
  return (
    <a
      {...props}
      onClick={e => {
        e.preventDefault();
        router.push(props.href || "");
      }}
    />
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

let dynamicRegistry: Record<string, RouteHandler> = {};
function processRoutes(
  router: RouteRecognizer<RouteHandler>,
  routes: RouteDefinition[],
  root: string,
  parentRoutes: RouteDef<RouteHandler>[] = []
) {
  routes.forEach(r => {
    let handler;
    if (typeof r.component === "string") {
      handler = dynamicRegistry[r.component];
      if (!(handler && handler.data === r.data))
        dynamicRegistry[r.component] = handler = {
          component: lazy(() => import(root + r.component)),
          data: r.data
        };
    } else handler = { component: r.component, data: r.data };
    const mapped: RouteDef<RouteHandler> = {
      path: root + r.path,
      handler
    };
    if (!r.children) return router.add([...parentRoutes, mapped]);
    processRoutes(router, r.children, root, [...parentRoutes, mapped]);
  });
}
