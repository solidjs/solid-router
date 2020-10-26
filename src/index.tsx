import { createContext, useContext, Component, createSignal, createMemo, lazy } from "solid-js";
import { Dynamic } from "solid-js/dom";
import { RecognizeResults, RouteRecognizer, Route as RouteDef } from "./recognizer";
export { parseQueryString, generateQueryString } from "./recognizer";

interface RouteDefinition {
  path: string;
  component: string;
  children?: RouteDefinition[];
}

interface Router {
  location: string;
  current: RecognizeResults<Component<any>> | undefined;
  push: (p: string) => void;
}

const RouterContext = createContext<{
  level: number;
  router: Router;
}>();

export function useRouter() {
  return useContext(RouterContext);
}

export function Route<T>(props: T) {
  const { router, level } = useRouter(),
    resolved = createMemo(
      () => {
        const resolved = router.current;
        return (resolved && resolved[level]) || { handler: undefined, params: undefined };
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
      <Dynamic component={resolved().handler} params={resolved().params} {...props} />
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

export const Router: Component<{ routes: RouteDefinition[] }> = props => {
  const router = createRouter(props.routes);
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

function createRouter(routes: RouteDefinition[], initialURL?: string): Router {
  const recognizer = new RouteRecognizer<Component<any>>();
  processRoutes(recognizer, routes);

  const [location, setLocation] = createSignal(initialURL ? initialURL : window.location.pathname);
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
  router: RouteRecognizer<Component<any>>,
  routes: RouteDefinition[],
  parentRoutes: RouteDef<Component<any>>[] = []
) {
  routes.forEach(r => {
    const mapped: RouteDef<Component<any>> = {
      path: r.path,
      handler: lazy(() => import(r.component))
    };
    if (!r.children) return router.add([...parentRoutes, mapped]);
    processRoutes(router, r.children, [...parentRoutes, mapped]);
  });
}
