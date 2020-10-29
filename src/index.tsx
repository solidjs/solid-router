import { createContext, useContext, Component, createSignal, createMemo, lazy } from "solid-js";
import { Dynamic } from "solid-js/dom";
import {
  RecognizeResults,
  RouteRecognizer,
  Route as RouteDef,
  QueryParams,
  Params
} from "./recognizer";
export { parseQueryString, generateQueryString } from "./recognizer";

interface RouteDefinition {
  path: string;
  component: string;
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
  push: (p: string) => void;
}

const RouterContext = createContext<{
  level: number;
  router: Router;
}>();

export function useRouter() {
  return useContext(RouterContext);
}

interface RouteResolution {
  component?: Component<any>;
  params?: Params;
  query?: QueryParams;
  data?: Record<string, unknown>;
  handler?: RecognizeResults<RouteHandler>;
}
export function Route<T>(props: T) {
  const { router, level } = useRouter(),
    resolved = createMemo<RouteResolution>(
      prev => {
        const resolved = router.current;
        let result: RouteResolution = {
          component: undefined,
          data: undefined,
          params: undefined,
          query: undefined,
          handler: resolved
        };
        if (resolved && resolved[level]) {
          result.component = resolved[level].handler.component;
          result.params = resolved[level].params;
          result.query = resolved.queryParams;
          if ((!prev || prev.handler !== resolved) && resolved[level].handler.data)
            result.data = resolved[level].handler.data!({
              params: result.params,
              query: result.query
            });
        }
        return result;
      },
      undefined,
      true
    );

  return (
    <RouterContext.Provider
      value={{
        level: level + 1,
        router
      }}
    >
      <Dynamic
        component={resolved().component}
        params={resolved().params}
        query={resolved().query}
        {...(resolved().data || {})}
        {...props}
      />
    </RouterContext.Provider>
  );
}

export const Link: Component<JSX.AnchorHTMLAttributes<HTMLAnchorElement>> = props => {
  const { router } = useRouter();
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
  const router = createRouter(props.routes, props.initialURL, props.root);
  return (
    <RouterContext.Provider
      value={{
        level: 0,
        router
      }}
    >
      {props.children}
    </RouterContext.Provider>
  );
};

function createRouter(routes: RouteDefinition[], initialURL?: string, root: string = ""): Router {
  const recognizer = new RouteRecognizer<RouteHandler>();
  processRoutes(recognizer, routes, root);

  const [location, setLocation] = createSignal(
    initialURL ? initialURL : window.location.pathname + window.location.search
  );
  const current = createMemo(() => recognizer.recognize(location()));
  globalThis.window && (window.onpopstate = () => setLocation(window.location.pathname));

  return {
    get location() {
      return location();
    },
    get current() {
      return current();
    },
    push(path) {
      window.history.pushState("", "", path);
      setLocation(path);
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
      handler: {
        component: lazy(() => import(root + r.component)),
        data: r.data
      }
    };
    if (!r.children) return router.add([...parentRoutes, mapped]);
    processRoutes(router, r.children, root, [...parentRoutes, mapped]);
  });
}
