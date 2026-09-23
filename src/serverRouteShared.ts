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
  ServerRouteArgs,
  StandardSchemaV1
} from "./types.js";

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
  return typeof component === "function"
    ? (component as BrandedRouteComponent)[SERVER_ROUTE]
    : undefined;
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
  const schema = (route.key as RouteDefinition | undefined)?.search as
    | StandardSchemaV1<any, any>
    | undefined;
  let search: unknown = undefined;
  if (schema) {
    const outcome = schema["~standard"].validate({ ...query });
    if (outcome instanceof Promise)
      throw new Error("Async Standard Schema validation is not supported for search params");
    // Issues leave the raw values in place, matching useSearchParams: search
    // strings are user input, so defaults belong in the schema itself.
    search = outcome.issues ? { ...query } : outcome.value;
  }
  return { params: { ...params }, search };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if ((a as any)[k] !== (b as any)[k]) return false;
  return true;
}

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
