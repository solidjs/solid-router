// Server component routes (experimental — rides the experimental server
// components surface in @solidjs/web; the arg shape may change).
//
// `serverRouteComponent(source)` turns a function of route arguments that
// resolves to a component into a route `component`. It replaces the client
// wrapper a server-component route used to need:
//
//   // before: a client component exists only to make the call
//   const getStory = query(storyView, "story");
//   component: props => {
//     const View = dynamic(() => getStory(props.params.id));
//     return <View>{props.children}</View>;
//   }
//   // after
//   component: serverRouteComponent(query(storyView, "story"))
//
// The source is the app's: `query(fn, key)` for a request/response server
// component, `liveQuery(fn, key)` for one that streams successive versions,
// or any function of the args. The router does not choose the cache
// strategy and does not own the key — `revalidate("story")` is the app's,
// as it is for any query. What the router adds is the URL → call
// translation: it derives the call's arguments from the match, mounts the
// resolved component with the outlet as `children`, and calls the same
// source under preload intent (link hover, `preloadRoute`, the single-flight
// collector), so the query or live channel is warm before the navigation
// renders against it.
//
// Arguments are derived, not read from a live location: the call's
// `(function, arguments)` address keys the frame store and the query cache,
// so the args must name precisely what the route depends on. They are the
// params this route's pattern (with its ancestors') declares — never a
// child's, so a layout does not refetch when a leaf param changes — and, only
// when the route declares a `search` schema, its validated output.
//
// The router fills exactly one client position: `children`, with the outlet.
// A server component that takes other client positions — handlers, refs,
// named slots — has a client half, and that half is a client component; the
// helper does not pretend otherwise. Write the wrapper for that route.
import { dynamic } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { createComponent } from "solid-js";
import type { Component } from "solid-js";
import { SERVER_ROUTE, type BrandedRouteComponent } from "./serverRouteShared.js";
import type { Params, RouteSectionProps, ServerRouteArgs, ServerRouteFunction } from "./types.js";

/**
 * Use a server component as a route (experimental). `source` is a function
 * of the router-derived {@link ServerRouteArgs} — this route's `params`, and
 * `search` when the route declares a schema — resolving to a server
 * component: typically a `"use server"` function wrapped in `query()` or
 * `liveQuery()`, whose key the app names and revalidates. The router mounts
 * the result with the outlet as `children` and calls the same source under
 * preload intent, so link hover and single-flight collection warm it.
 *
 * `children` is the only client position the router fills, so the server
 * component may declare no other. One that takes client handlers, refs, or
 * slots has a client half — write an ordinary route component for it.
 *
 * ```ts
 * defineRoute({ path: "/stories/:id", component: serverRouteComponent(query(storyView, "story")) });
 * ```
 */
export function serverRouteComponent<P extends Params = Params, S = undefined>(
  source: ServerRouteFunction<P, S>
): Component<RouteSectionProps<unknown, P>> {
  const call = source as ServerRouteFunction<any, any>;

  // The component itself is the fallback for a mount the router core does
  // not drive (a plain `createComponent`): it has only the merged params to
  // go on, so it calls with those. The core mounts through the brand with
  // this level's params instead.
  const route: BrandedRouteComponent = (routeProps: RouteSectionProps) =>
    render(() => ({ params: { ...routeProps.params }, search: undefined }), routeProps);

  function render(args: () => ServerRouteArgs<Params, unknown>, routeProps: RouteSectionProps) {
    // The source may answer a component, a promise of one, or (a live query)
    // successive components; `dynamic`'s memo lands each the same way.
    const View = dynamic(() => call(args()) as Promise<Component<any>>);
    return createComponent(View, {
      get children() {
        return routeProps.children;
      }
    }) as JSX.Element;
  }

  route[SERVER_ROUTE] = { call, render };
  return route as Component<RouteSectionProps<unknown, P>>;
}
