/*@refresh skip*/

import type { Component, JSX, Owner } from "solid-js";
import { type RequestEvent, getRequestEvent, isServer } from "solid-js/web";
import {
  children,
  createMemo,
  createRoot,
  getOwner,
  mergeProps,
  on,
  Show,
  untrack
} from "solid-js";
import {
  createBranches,
  createRouteContext,
  createRouterContext,
  getIntent,
  getRouteMatches,
  RouteContextObj,
  RouterContextObj,
  setInPreloadFn
} from "../routing.js";
import type {
  MatchFilters,
  RouteContext,
  RouteDefinition,
  RouterIntegration,
  RouterContext,
  Branch,
  RouteSectionProps,
  RouteMatch,
  OutputMatch,
  RoutePreloadFunc
} from "../types.js";

export type BaseRouterProps = {
  base?: string;
  /**
   * A component that wraps the content of every route.
   */
  root?: Component<RouteSectionProps>;
  rootPreload?: RoutePreloadFunc;
  singleFlight?: boolean;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
  transformUrl?: (url: string) => string;
  /** @deprecated use rootPreload */
  rootLoad?: RoutePreloadFunc;
};

export const createRouterComponent = (router: RouterIntegration) => (props: BaseRouterProps) => {
  const { base } = props;
  const routeDefs = children(() => props.children as JSX.Element) as unknown as () =>
    | RouteDefinition
    | RouteDefinition[];

  const branches = createMemo(() => createBranches(routeDefs(), props.base || ""));
  let context: Owner;
  const routerState = createRouterContext(router, branches, () => context, {
    base,
    singleFlight: props.singleFlight,
    transformUrl: props.transformUrl
  });
  router.create && router.create(routerState);
  return (
    <RouterContextObj.Provider value={routerState}>
      <Root
        routerState={routerState}
        root={props.root}
        preload={props.rootPreload || props.rootLoad}
      >
        {(context = getOwner()!) && null}
        <Routes routerState={routerState} branches={branches()} />
      </Root>
    </RouterContextObj.Provider>
  );
};

function Root(props: {
  routerState: RouterContext;
  root?: Component<RouteSectionProps>;
  preload?: RoutePreloadFunc;
  children: JSX.Element;
}) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(
    () =>
      props.preload &&
      untrack(() => {
        setInPreloadFn(true);
        props.preload!({ params, location, intent: getIntent() || "initial" });
        setInPreloadFn(false);
      })
  );
  return (
    <Show when={props.root} keyed fallback={props.children}>
      {Root => (
        <Root params={params} location={location} data={data()} slots={{}}>
          {props.children}
        </Root>
      )}
    </Show>
  );
}

function createOutputMatches(matches: RouteMatch[]): OutputMatch[] {
  return matches.map(({ route, path, params, slots }) => {
    const match: OutputMatch = {
      path: route.originalPath,
      pattern: route.pattern,
      match: path,
      params,
      info: route.info
    };

    if (slots) {
      match.slots = {};

      for (const [slot, matches] of Object.entries(slots))
        match.slots[slot] = createOutputMatches(matches);
    }

    return match;
  });
}

function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
  if (isServer) {
    const e = getRequestEvent();
    if (e?.router?.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    if (e) {
      (e.router ??= {}).matches ??= createOutputMatches(props.routerState.matches());
    }
  }

  type Disposer = { dispose?: () => void; slots?: Record<string, Disposer[]> };

  const globalDisposers: Disposer[] = [];
  let root: RouteContext | undefined;

  function disposeAll({ dispose, slots }: Disposer) {
    dispose?.();
    if (slots) {
      for (const d of Object.values(slots)) d.forEach(disposeAll);
    }
  }

  // Renders an array of route matches, recursively calling itself to branch
  // off for slots. Almost but not quite a regular tree since children aren't included in slots
  function renderRouteContexts(
    matches: RouteMatch[],
    parent: RouteContext,
    disposers: Disposer[],
    prev?: { matches: RouteMatch[]; contexts: RouteContext[] },
    fullyRenderedRoutes = () => routeStates(),
    getLiveMatches = () => props.routerState.matches()
  ): RouteContext[] {
    let equal = matches.length === prev?.matches.length;

    const renderedContexts: RouteContext[] = [];

    // matches get processed linearly unless a slot is encountered, at which point
    // this function recurses
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const prevMatch = prev?.matches[i];
      const prevContext = prev?.contexts[i];

      // the context above the one about to be rendered
      const matchParentContext = renderedContexts[i - 1] ?? parent;

      const slotContexts: Record<string, RouteContext[]> = {};
      // outlets rendered for the slots of the parent - includes 'children'
      const slotOutlets: Record<string, () => JSX.Element> = {};

      if (match.slots) {
        const slotsDisposers: Record<string, Disposer[]> = ((disposers[i] ??= {}).slots ??= {});

        for (const [slot, matches] of Object.entries(match.slots)) {
          slotContexts[slot] = renderRouteContexts(
            matches,
            renderedContexts[i],
            (slotsDisposers[slot] ??= []),
            prevMatch?.slots?.[slot] && prevContext?.slots?.[slot]
              ? { matches: prevMatch?.slots?.[slot], contexts: prevContext?.slots?.[slot] }
              : undefined,
            () => fullyRenderedRoutes()[i]?.slots?.[slot] ?? [],
            () => getLiveMatches()[i]?.slots?.[slot] ?? []
          );
        }
      }

      if (prev && match.route.key === prevMatch?.route.key) {
        renderedContexts[i] = prev.contexts[i];
        renderedContexts[i].slots = slotContexts;
      } else {
        equal = false;

        if (disposers?.[i]) disposers[i].dispose?.();

        createRoot(dispose => {
          disposers[i] = {
            ...disposers[i],
            dispose
          };

          for (const slot of Object.keys(match.slots ?? {})) {
            const fullyRenderedSlotRoutes = () => fullyRenderedRoutes()[i]?.slots?.[slot];

            slotOutlets[slot] = createOutlet(() => fullyRenderedSlotRoutes()?.[0]);
          }

          // children renders the next match in the next context
          slotOutlets.children = createOutlet(() => fullyRenderedRoutes()[i + 1]);

          renderedContexts[i] = createRouteContext(
            props.routerState,
            matchParentContext,
            slotOutlets,
            () => getLiveMatches()[i]
          );

          renderedContexts[i].slots = slotContexts;
        });
      }
    }

    disposers.splice(renderedContexts.length).forEach(disposeAll);

    if (prev && equal) return prev.contexts;

    return renderedContexts;
  }

  const routeStates = createMemo(
    on(
      props.routerState.matches,
      (nextMatches, prevMatches, prevContexts: RouteContext[] | undefined) => {
        const next = renderRouteContexts(
          nextMatches,
          props.routerState.base,
          globalDisposers,
          prevMatches && prevContexts ? { matches: prevMatches, contexts: prevContexts } : undefined
        );

        root = next[0];

        return next;
      }
    )
  );

  return createOutlet(() => routeStates() && root)();
}

const createOutlet = (child: () => RouteContext | undefined) => () =>
  (
    <Show when={child()} keyed>
      {child => <RouteContextObj.Provider value={child}>{child.outlet()}</RouteContextObj.Provider>}
    </Show>
  );

export type RouteProps<S extends string, T = unknown, TSlots extends string = never> = {
  path?: S | S[];
  children?: JSX.Element;
  preload?: RoutePreloadFunc<T>;
  matchFilters?: MatchFilters<S>;
  component?: Component<RouteSectionProps<T, TSlots>>;
  info?: Record<string, any>;
  /** @deprecated use preload */
  load?: RoutePreloadFunc<T>;
};

export const Route = <S extends string, T = unknown, TSlots extends string = never>(
  props: RouteProps<S, T, TSlots>
) => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    }
  }) as unknown as JSX.Element;
};

// for data only mode with single flight mutations
function dataOnly(event: RequestEvent, routerState: RouterContext, branches: Branch[]) {
  const url = new URL(event.request.url);
  const prevMatches = getRouteMatches(
    branches,
    new URL(event.router!.previousUrl || event.request.url).pathname
  );
  const matches = getRouteMatches(branches, url.pathname);

  preloadMatches(prevMatches, matches);

  function preloadMatches(prevMatches: RouteMatch[], matches: RouteMatch[]) {
    for (let match = 0; match < matches.length; match++) {
      if (!prevMatches[match] || matches[match].route !== prevMatches[match].route)
        event.router!.dataOnly = true;
      const { route, params } = matches[match];
      route.preload &&
        route.preload({
          params,
          location: routerState.location,
          intent: "preload"
        });

      if (matches[match].slots) {
        for (const [slot, slotMatches] of Object.entries(matches[match].slots ?? {})) {
          preloadMatches(prevMatches[match].slots?.[slot] ?? [], slotMatches);
        }
      }
    }
  }
}
