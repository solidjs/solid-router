// The light half of server component routes: the brand the router core reads
// off a route `component`, and the derivation of a route's call arguments.
// Deliberately free of `query`/`dynamic` — routing.ts imports this module,
// and routing.ts is in every app's eager graph. The heavy half (the helper
// that builds the branded component) lives in serverRouteComponent.ts and only
// enters a bundle when an app calls `serverRouteComponent()`.
import type { Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";
import type {
  Params,
  RouteDefinition,
  RouteDescription,
  RouteSectionProps,
  SearchParams,
  ServerRouteArgs
} from "./types.js";
import { validateSearch } from "./utils.js";

export const SERVER_ROUTE = Symbol("solid-router.serverRoute");

/**
 * What `serverRouteComponent()` attaches to the route component it returns, and
 * what the router core drives it through: `call` is the query-wrapped server
 * function (preload and single-flight collection warm/collect through it),
 * `render` mounts the resolved server component for the current args with
 * the route's props (`children` is the outlet).
 */
export interface ServerRouteBrand {
  call: (args: ServerRouteArgs<Params, unknown>) => unknown;
  render: (
    args: Accessor<ServerRouteArgs<Params, unknown>>,
    route: RouteSectionProps
  ) => JSX.Element;
}

export type BrandedRouteComponent = Function & { [SERVER_ROUTE]?: ServerRouteBrand };

/** The brand carried by a route component built with `serverRouteComponent()`, if any. */
export function serverRouteOf(component: unknown): ServerRouteBrand | undefined {
  return (component as BrandedRouteComponent | undefined)?.[SERVER_ROUTE];
}

/**
 * Derive a server route's call arguments from a match: the match's params
 * (this route's pattern and its ancestors' — never a child's) and the route's
 * `search` schema output when one is declared. Reads `query` only when a
 * schema exists, so a search-agnostic route never tracks the query string.
 */
export function serverRouteArgs(
  route: RouteDescription,
  params: Params,
  query: SearchParams
): ServerRouteArgs<Params, unknown> {
  const schema = (route.key as RouteDefinition | undefined)?.search;
  if (schema) {
    const raw = { ...query };
    const outcome = validateSearch(schema, raw);
    // Issues leave the raw values in place, matching useSearchParams: search
    // strings are user input, so defaults belong in the schema itself.
    return { params: { ...params }, search: outcome.issues ? raw : outcome.value };
  }
  // No schema: leave the key out rather than carrying `search: undefined` —
  // the args are sent as plain JSON by default and the runtime's JSON-safety
  // check rejects explicit `undefined` (#615). Destructuring on the server
  // reads the same either way, and the args-memo equality treats an absent
  // key and undefined alike.
  return { params: { ...params } };
}

const shallowEqual = (a: any, b: any): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(k => a[k] === b[k]));

/**
 * Structural equality for the args memo: a navigation produces fresh match
 * objects even when this level's params are unchanged, and an equal call
 * must not re-enter the source (and refetch).
 */
export function serverRouteArgsEqual(
  a: ServerRouteArgs<Params, unknown>,
  b: ServerRouteArgs<Params, unknown>
) {
  return shallowEqual(a.params, b.params) && shallowEqual(a.search, b.search);
}
