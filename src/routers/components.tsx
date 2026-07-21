/*@refresh skip*/

import type {Component} from "solid-js";
import type {JSX} from "@solidjs/web";
import {createMemo, createRoot, getOwner, onCleanup, runWithOwner, untrack} from "solid-js";
import {getRequestEvent, isServer, type RequestEvent} from "@solidjs/web";
import {
    createRouteContext,
    getIntent,
    getRouteMatches,
    RouteContextObj,
    setInPreloadFn
} from "../routing.js";
import type {
    Branch,
    RouteContext,
    RouteMatch,
    RoutePreloadFunc,
    RouterContext,
    RouteSectionProps
} from "../types.js";

export function Root(props: {
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
        try {
          return props.preload!({ params, location, intent: getIntent() || "initial" });
        } finally {
          setInPreloadFn(false);
        }
      })
  );
  const RootComp = props.root;
  if (RootComp) {
    return (
      <RootComp params={params} location={location} data={data()}>
        {props.children}
      </RootComp>
    );
  }
  return props.children;
}

export function Routes(props: { routerState: RouterContext; branches: Branch[] }) {
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

  const disposers: (() => void)[] = [];
  let root: RouteContext | undefined;
  let prevMatches: RouteMatch[] | undefined;
  // dispose the detached per-route roots when this component unmounts, otherwise
  // they stay subscribed to `matches` and crash on a later navigation (#451)
  onCleanup(() => disposers.forEach(dispose => dispose()));
  // Route roots must outlive re-runs of the `routeStates` memo below, so they
  // are created under the owner of this component rather than the memo's
  // computation (which disposes its children every time it re-runs).
  const owner = getOwner()!;

  const routeStates = createMemo((prev: RouteContext[] | undefined) => {
      const nextMatches = props.routerState.matches();
      const previousMatches = prevMatches;
      let equal = previousMatches && nextMatches.length === previousMatches.length;
      const next: RouteContext[] = [];
      for (let i = 0, len = nextMatches.length; i < len; i++) {
        const prevMatch = previousMatches && previousMatches[i];
        const nextMatch = nextMatches[i];

        if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
          next[i] = prev[i];
        } else {
          equal = false;
          if (disposers[i]) {
            disposers[i]();
          }

          runWithOwner(owner, () =>
            createRoot(dispose => {
              disposers[i] = dispose;
              const routeKey = nextMatch.route.key;
              // Retain the last matches in which this route participated so
              // that its components and preloads never observe another
              // route's params/path while this route is being torn down.
              const matchesAtLevel = createMemo((prev?: RouteMatch[]) => {
                const routeMatches = props.routerState.matches();
                const m = routeMatches[i];
                return m && m.route.key === routeKey ? routeMatches : prev || nextMatches;
              });
              next[i] = createRouteContext(
                props.routerState,
                next[i - 1] || props.routerState.base,
                createOutlet(() => routeStates()?.[i + 1]),
                () => matchesAtLevel()[i],
                matchesAtLevel
              );
            })
          );
        }
      }

      disposers.splice(nextMatches.length).forEach(dispose => dispose());

      if (prev && equal) {
        prevMatches = nextMatches;
        return prev;
      }
      root = next[0];
      prevMatches = nextMatches;
      return next;
    });
  const outlet = createOutlet(() => routeStates() && root);
  return <>{outlet()}</>;
}

const createOutlet = (child: () => RouteContext | undefined) => {
  return () => {
    const c = child();
    if (c) {
      return <RouteContextObj value={c}>{c.outlet()}</RouteContextObj>;
    }
    return undefined;
  };
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
    route.preload &&
      route.preload({
        params,
        location: routerState.location,
        intent: "preload"
      });
  }
}
