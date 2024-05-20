/*@refresh skip*/

import type { Component, JSX, Owner } from "solid-js";
import { type RequestEvent, getRequestEvent, isServer } from "solid-js/web";
import {
  children,
  createMemo,
  createRoot,
  createSignal,
  For,
  getOwner,
  mergeProps,
  on,
  onCleanup,
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
  setInLoadFn
} from "../routing.js";
import type {
  MatchFilters,
  RouteContext,
  RouteLoadFunc,
  RouteDefinition,
  RouterIntegration,
  RouterContext,
  Branch,
  RouteSectionProps,
  RouteMatch
} from "../types.js";

export type BaseRouterProps = {
  base?: string;
  /**
   * A component that wraps the content of every route.
   */
  root?: Component<RouteSectionProps>;
  rootLoad?: RouteLoadFunc;
  singleFlight?: boolean;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
  transformUrl?: (url: string) => string;
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
      <Root routerState={routerState} root={props.root} load={props.rootLoad}>
        {(context = getOwner()!) && null}
        <Routes routerState={routerState} branches={branches()} />
      </Root>
    </RouterContextObj.Provider>
  );
};

function Root(props: {
  routerState: RouterContext;
  root?: Component<RouteSectionProps>;
  load?: RouteLoadFunc;
  children: JSX.Element;
}) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(
    () =>
      props.load &&
      untrack(() => {
        setInLoadFn(true);
        props.load!({ params, location, intent: getIntent() || "initial" });
        setInLoadFn(false);
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

function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    e &&
      ((e.router || (e.router = {})).matches ||
        (e.router.matches = props.routerState.matches().map(({ route, path, params }) => ({
          path: route.originalPath,
          pattern: route.pattern,
          match: path,
          params,
          info: route.info
        }))));
  }

  type Disposers = { dispose: () => void; slots?: Record<string, Disposers> }[];

  const globalDisposers: Disposers = [];
  let root: RouteContext | undefined;

  function disposeAll(disposer: Disposers) {
    for (const { dispose, slots } of disposer) {
      dispose();
      slots && Object.values(slots).forEach(disposeAll);
    }
  }

  // Renders an array of route matches, recursively calling itself to branch
  // off for slots
  // Takes linear branches of matches and creates linear branches of contexts
  // Almost but not quite a regular tree since children aren't included in slots
  function renderRouteContexts(
    matches: RouteMatch[],
    parent: RouteContext = props.routerState.base
  ): RouteContext[] {
    const renderedContexts: RouteContext[] = [];

    for (let i = 0; i < matches.length; i++) {
      // matches get processed linearly unless a slot is encountered, at which point
      // this function recurses
      const match = matches[i];

      // the context above the one about to be rendered
      const matchParentContext = renderedContexts[i - 1] ?? parent;

      // outlets rendered for the slots of the parent - includes 'children'
      const slotOutlets: Record<string, () => JSX.Element> = {};
      // context branches for each slot of this match
      let slotContexts: Record<string, RouteContext[]> | undefined;

      const dispose = createRoot(dispose => {
        if ("slots" in match && match.slots) {
          slotContexts = {};

          for (const [slot, matches] of Object.entries(match.slots)) {
            slotContexts[slot] = renderRouteContexts(matches, matchParentContext);
            slotOutlets[slot] = createOutlet(() => slotContexts?.[slot]?.[0]);
          }
        }

        // children renders the next match in the next context
        slotOutlets["children"] = createOutlet(() => renderedContexts[i + 1]);

        const context = createRouteContext(
          props.routerState,
          matchParentContext,
          slotOutlets,
          match
        );
        context.slots = slotContexts;

        renderedContexts[i] = context;

        return dispose;
      });

      onCleanup(dispose);
    }

    return renderedContexts;
  }

  const routeStates = createMemo(
    on(props.routerState.matches, nextMatches => {
      const next = renderRouteContexts(nextMatches);

      root = next[0];

      return next;
    })
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
  load?: RouteLoadFunc<T>;
  matchFilters?: MatchFilters<S>;
  component?: Component<RouteSectionProps<T, TSlots>>;
  info?: Record<string, any>;
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
  for (let match = 0; match < matches.length; match++) {
    if (!prevMatches[match] || matches[match].route !== prevMatches[match].route)
      event.router!.dataOnly = true;
    const { route, params } = matches[match];
    route.load &&
      route.load({
        params,
        location: routerState.location,
        intent: "preload"
      });
  }
}

// function renderRouteMatches(
//   nextMatches: RouteMatch[],
//   // prevMatches?: RouteMatch[],
//   // prev?: RouteContext[],
//   disposerPath: [number, string][] = []
// ): RouteContext[] {
//   // let equal = prevMatches && nextMatches.length === prevMatches.length;

//   const next: RouteContext[] = [];
//   for (let i = 0, len = nextMatches.length; i < len; i++) {
//     // const prevMatch = prevMatches && prevMatches[i];
//     const nextMatch = nextMatches[i];

//     // if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
//     //   next[i] = prev[i];

//     //   if (prevMatch.slots && nextMatch.slots) {
//     //     const nextSlots = (next[i].slots ??= {});
//     //     for (const [name, slot] of Object.entries(nextMatch.slots)) {
//     //       nextSlots[name] = renderRouteMatches(
//     //         slot,
//     //         prevMatch.slots?.[name],
//     //         prev[i].slots?.[name],
//     //         [...disposerPath, [i, name]]
//     //       );
//     //     }
//     //   }
//     // } else {
//     //   equal = false;

//     let disposers = globalDisposers;
//     for (const [i, slot] of disposerPath) {
//       const disposer = disposers[i];
//       if (!disposer) break;

//       disposers = (disposer.slots ??= {})[slot] ??= [];
//     }

//     if (disposers[i]) {
//       disposeAll([disposers[i]]);
//     }

//     createRoot(dispose => {
//       disposers[i] = { dispose };

//       const outlets: Record<string, () => JSX.Element> = {};
//       const slots: Record<string, RouteContext[]> = {};

//       if (nextMatch.slots)
//         for (const [name, slot] of Object.entries(nextMatch.slots)) {
//           const rendered = renderRouteMatches(
//             slot,
//             // prevMatch?.slots?.[name],
//             // prev?.[i].slots?.[name],
//             [...disposerPath, [i, name]]
//           );

//           if (rendered.length === 0) continue;

//           slots[name] = rendered;
//           outlets[name] = createOutlet(() => {
//             const context = rendered[0];
//             if (!context) return;

//             return {
//               context,
//               outlet: context.outlet
//             };
//           });
//         }

//       outlets["children"] = createOutlet(() => {
//         const context = createMemo(() => {
//           let traversed = routeStates();

//           for (const [i, slot] of disposerPath) {
//             traversed = traversed[i].slots?.[slot]!;
//           }

//           return traversed[i + 1];
//         });

//         return {
//           context: context(),
//           outlet: context().outlet
//         };
//       });

//       next[i] = createRouteContext(
//         props.routerState,
//         next[i - 1] || props.routerState.base,
//         outlets,
//         nextMatches[i]
//       );

//       next[i].slots = slots;
//     });
//     // }
//   }

//   globalDisposers.splice(nextMatches.length).forEach(disposer => {
//     disposeAll([disposer]);
//   });

//   // if (prev && equal) {
//   //   return prev;
//   // }

//   return next;
// }
