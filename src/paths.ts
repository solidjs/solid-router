import type {
  Params,
  RouteDefinition,
  SetSearchParams,
  StandardSchemaV1,
  TypedPath
} from "./types.js";
import { mergeSearchString, normalizePath } from "./utils.js";

/*
 * The typed path proxy. Property access descends into static segments, calls
 * bind params, and a zero-arg or search-object call terminates to a plain
 * string. The runtime is tree-agnostic — it just builds strings — while the
 * `RoutePaths<R>` type derived from the route config constrains which
 * accesses and calls exist. Every node also coerces via `toString`, so nodes
 * drop straight into `href`, `navigate()`, and `redirect()`.
 */

// ---------------------------------------------------------------------------
// Typed match filters
// ---------------------------------------------------------------------------

declare const FILTER_TYPE: unique symbol;

/**
 * A match filter that also declares the TypeScript type accepted for the
 * param at `paths` callsites (the runtime param remains a string).
 */
export interface TypedMatchFilter<T> {
  (s: string): boolean;
  readonly [FILTER_TYPE]: T;
}

/** Matches integer segments; types the param as `number` in the path proxy. */
export const int = ((s: string) => /^-?\d+$/.test(s)) as unknown as TypedMatchFilter<number>;

// ---------------------------------------------------------------------------
// RoutePaths<R> — the proxy's type, derived from the route tree
// ---------------------------------------------------------------------------

type Flat<T> = { [K in keyof T]: T[K] } & {};

type SegmentsOf<P extends string> = P extends `${infer A}/${infer B}`
  ? [...SegmentsOf<A>, ...SegmentsOf<B>]
  : P extends ""
  ? []
  : [P];

type FilterArg<F> = F extends TypedMatchFilter<infer T>
  ? T
  : F extends readonly (infer S)[]
  ? S
  : string | number;

type ParamArg<Name extends string, F> = Name extends keyof F
  ? FilterArg<F[Name]>
  : string | number;

/** Collects a maximal run of required params (and a trailing splat) into one call's argument tuple. */
type ParamRun<
  Segs extends readonly string[],
  F,
  Args extends readonly unknown[] = [],
  PAcc extends Params = {}
> = Segs extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? H extends `:${string}?`
    ? { args: Args; params: PAcc; rest: Segs }
    : H extends `:${infer N}`
    ? ParamRun<R, F, [...Args, ParamArg<N, F>], PAcc & { [K in N]: string }>
    : H extends `*${infer N}`
    ? { args: [...Args, string | number]; params: PAcc & { [K in N]: string }; rest: R }
    : { args: Args; params: PAcc; rest: Segs }
  : { args: Args; params: PAcc; rest: Segs };

/** Terminating calls available on every route end: zero-arg, or search object plus optional hash. */
export interface PathEnd<Search = SetSearchParams, P extends Params = Params>
  extends TypedPath<P> {
  (): string;
  (search: Search, hash?: string): string;
}

type SearchInputOf<Def> = Def extends { search: infer S }
  ? S extends StandardSchemaV1<any, any>
    ? NonNullable<S["~standard"]["types"]>["input"]
    : SetSearchParams
  : SetSearchParams;

type FiltersOf<Def> = Def extends { matchFilters: infer F } ? F : {};

type ChildrenOf<Def> = Def extends { children: infer C } ? C : undefined;

type ChildPaths<C, PAcc extends Params> = [C] extends [undefined]
  ? {}
  : C extends readonly unknown[]
  ? TuplePaths<C, PAcc>
  : RouteContrib<C, PAcc>;

type TuplePaths<R extends readonly unknown[], PAcc extends Params> = R extends readonly [
  infer H,
  ...infer T extends readonly unknown[]
]
  ? RouteContrib<H, PAcc> & TuplePaths<T, PAcc>
  : {};

type PathLeaf<Search, C, PAcc extends Params> = PathEnd<Search, Flat<PAcc>> &
  ChildPaths<C, PAcc>;

type PathNode<
  Segs extends readonly string[],
  F,
  Search,
  C,
  PAcc extends Params
> = Segs extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? H extends `:${infer N}?`
    ? ((arg: ParamArg<N, F>) => PathNode<R, F, Search, C, PAcc & { [K in N]?: string }>) &
        PathNode<R, F, Search, C, PAcc & { [K in N]?: string }>
    : H extends `:${string}` | `*${string}`
    ? ParamCallNode<Segs, F, Search, C, PAcc>
    : { [K in H]: PathNode<R, F, Search, C, PAcc> }
  : PathLeaf<Search, C, PAcc>;

type ParamCallNode<
  Segs extends readonly string[],
  F,
  Search,
  C,
  PAcc extends Params
> = ParamRun<Segs, F> extends {
  args: infer A extends readonly unknown[];
  params: infer P2 extends Params;
  rest: infer R2 extends readonly string[];
}
  ? ((...args: A) => PathNode<R2, F, Search, C, PAcc & P2>) &
      (R2 extends readonly [] ? { (...args: [...A, Search, string?]): string } : {}) &
      TypedPath<Flat<PAcc & P2>>
  : never;

type RouteContrib<Def, PAcc extends Params> = Def extends { path: infer P }
  ? [P] extends [undefined]
    ? ChildPaths<ChildrenOf<Def>, PAcc>
    : P extends readonly string[]
    ? MultiPathContrib<P, Def, PAcc>
    : P extends string
    ? string extends P
      ? any
      : PathNode<SegmentsOf<P>, FiltersOf<Def>, SearchInputOf<Def>, ChildrenOf<Def>, PAcc>
    : any
  : ChildPaths<ChildrenOf<Def>, PAcc>;

type MultiPathContrib<
  Ps extends readonly string[],
  Def,
  PAcc extends Params
> = Ps extends readonly [infer H extends string, ...infer T extends readonly string[]]
  ? PathNode<SegmentsOf<H>, FiltersOf<Def>, SearchInputOf<Def>, ChildrenOf<Def>, PAcc> &
      MultiPathContrib<T, Def, PAcc>
  : {};

/**
 * The type of a router instance's `paths` proxy for a given route tree.
 * Requires the tree to be a literal tuple (`as const` or a `const` type
 * param); non-literal trees fall back to an untyped proxy.
 */
export type RoutePaths<R extends readonly RouteDefinition[]> = number extends R["length"]
  ? any
  : PathEnd<SetSearchParams, {}> & TuplePaths<R, {}>;

/** Extracts the params record a paths node binds, as runtime (string-valued) params. */
export type PathParamsOf<N> = N extends TypedPath<infer P> ? Flat<P> : Params;

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const encodeParam = (value: unknown) =>
  String(value).split("/").map(encodeURIComponent).join("/");

/**
 * Creates the runtime path proxy. It is instance-scoped: `renderPath` comes
 * from the router's history adapter (eg. hash routing prefixes `#`), and
 * `base` is baked into every produced path.
 */
export function createPathsProxy(
  renderPath: (path: string) => string = p => p,
  base: string = ""
): any {
  const toHref = (pathname: string, suffix: string = "") =>
    renderPath(pathname || "/") + suffix;

  function node(pathname: string): any {
    const build = (...args: unknown[]) => {
      let path = pathname;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === "object" && arg !== null) {
          // a search object terminates; an optional hash string may follow
          const hash = typeof args[i + 1] === "string" ? `#${args[i + 1]}` : "";
          return toHref(path, mergeSearchString("", arg as SetSearchParams) + hash);
        }
        path += `/${encodeParam(arg)}`;
      }
      // zero-arg calls terminate; param-only calls stay chainable
      return args.length ? node(path) : toHref(path);
    };
    return new Proxy(build, {
      get(_, prop) {
        if (prop === "toString") return () => toHref(pathname);
        if (typeof prop === "symbol")
          return prop === Symbol.toPrimitive ? () => toHref(pathname) : undefined;
        return node(`${pathname}/${prop}`);
      }
    });
  }

  return node(normalizePath(base));
}
