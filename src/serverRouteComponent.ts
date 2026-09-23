// Server component routes (experimental — rides the experimental server
// components surface in @solidjs/web; the arg shape may change).
//
// `serverRouteComponent(fn)` turns a `"use server"` function that returns a
// component into a route `component`. It replaces the client wrapper a
// server-component route used to need:
//
//   // before: a client component exists only to make the call
//   component: props => {
//     const View = dynamic(() => getStory(props.params.id));
//     return <View>{props.children}</View>;
//   }
//   // after
//   component: serverRouteComponent(storyRoute)   // async ({ params }) => { "use server"; ... }
//
// The mechanism is the same one the wrapper used — `query` for cache identity
// (preload participation, single-flight collection, revalidation after
// actions) and `dynamic` for the equals-gated mount that morphs in place —
// applied by the router rather than restated per route. What the router adds
// is the URL → call translation: it derives the call's arguments from the
// match and drives the same call from hover preload and from the single
// flight collector, so one entry serves render, preload, and mutation
// responses.
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
import { query } from "./data/query.js";
import { SERVER_ROUTE, type BrandedRouteComponent } from "./serverRouteShared.js";
import type { Params, RouteSectionProps, ServerRouteArgs, ServerRouteFunction } from "./types.js";

/**
 * Use a server component as a route (experimental). `fn` is a `"use server"`
 * function taking the router-derived {@link ServerRouteArgs} — this route's
 * `params`, and `search` when the route declares a schema — and resolving to
 * a server component. The router mounts it with the outlet as `children`,
 * warms the same call on link intent, and collects it for single-flight
 * mutation responses.
 *
 * `children` is the only client position the router fills, so the server
 * component may declare no other. One that takes client handlers, refs, or
 * slots has a client half — write an ordinary route component for it.
 *
 * ```ts
 * defineRoute({ path: "/stories/:id", component: serverRouteComponent(storyView) });
 * ```
 */
export function serverRouteComponent<P extends Params = Params, S = undefined>(
  fn: ServerRouteFunction<P, S>
): Component<RouteSectionProps<unknown, P>> {
  const reference = fn as ServerRouteFunction<any, any> & { id?: string };
  // One query entry per reference: the cache key (the function id) has to
  // agree between the render that mounts the route, the hover preload that
  // warms it, and the single-flight collector that re-produces its region.
  // A server function reference always carries its build-stable id; a
  // hand-built brand (tests) falls back to the function name.
  const call = query(reference, "route:" + (reference.id || reference.name));

  // The component itself is the fallback for a mount the router core does
  // not drive (a plain `createComponent`): it has only the merged params to
  // go on, so it calls with those. The core mounts through the brand with
  // this level's params instead.
  const route: BrandedRouteComponent = (routeProps: RouteSectionProps) =>
    render(() => ({ params: { ...routeProps.params }, search: undefined }), routeProps);

  function render(args: () => ServerRouteArgs<Params, unknown>, routeProps: RouteSectionProps) {
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
