import type {
  Params,
  RouteDefinition,
  SearchParams,
  SetSearchParams,
  StandardSchemaV1,
  TypedPath,
  TypedSearchPath
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

/** The search param types a route end carries: input builds URLs, output is what parsing returns. */
export interface SearchTypes {
  input: any;
  output: any;
}

export interface DefaultSearchTypes {
  input: SetSearchParams;
  output: SearchParams;
}

/** Terminating calls available on every route end: zero-arg, or search object plus optional hash. */
export interface PathEnd<Sch extends SearchTypes = DefaultSearchTypes, P extends Params = Params>
  extends TypedPath<P>,
    TypedSearchPath<Sch["input"], Sch["output"]> {
  (): string;
  (search: Sch["input"], hash?: string): string;
}

type SearchTypesOf<Def> = Def extends { search: infer S }
  ? S extends StandardSchemaV1<any, any>
    ? {
        input: NonNullable<S["~standard"]["types"]>["input"];
        output: NonNullable<S["~standard"]["types"]>["output"];
      }
    : DefaultSearchTypes
  : DefaultSearchTypes;

type FiltersOf<Def> = Def extends { matchFilters: infer F } ? F : {};

type ChildrenOf<Def> = Def extends { children: infer C } ? C : undefined;

/**
 * Sees through a lazy `children` thunk: the routes the import's promise
 * resolves to (its `default` or `routes` export, matching the runtime) type
 * exactly like inline children. Only tables genuinely built at runtime —
 * where the thunk's return type is a plain `RouteDefinition[]` — degrade to
 * untyped, definitionally.
 */
type ResolvedChildren<C> = C extends () => infer R
  ? Awaited<R> extends infer M
    ? M extends { default: infer D }
      ? D
      : M extends { routes: infer D }
      ? D
      : M
    : never
  : C;

type ChildPaths<C, PAcc extends Params> = [C] extends [undefined]
  ? {}
  : ResolvedChildren<C> extends infer RC
  ? RC extends readonly unknown[]
    ? TuplePaths<RC, PAcc>
    : RouteContrib<RC, PAcc>
  : never;

type TuplePaths<R extends readonly unknown[], PAcc extends Params> = R extends readonly [
  infer H,
  ...infer T extends readonly unknown[]
]
  ? RouteContrib<H, PAcc> & TuplePaths<T, PAcc>
  : {};

type PathLeaf<Sch extends SearchTypes, C, PAcc extends Params> = PathEnd<Sch, Flat<PAcc>> &
  ChildPaths<C, PAcc>;

type PathNode<
  Segs extends readonly string[],
  F,
  Sch extends SearchTypes,
  C,
  PAcc extends Params
> = Segs extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? H extends `:${infer N}?`
    ? ((arg: ParamArg<N, F>) => PathNode<R, F, Sch, C, PAcc & { [K in N]?: string }>) &
        PathNode<R, F, Sch, C, PAcc & { [K in N]?: string }>
    : H extends `:${string}` | `*${string}`
    ? ParamCallNode<Segs, F, Sch, C, PAcc>
    : { [K in H]: PathNode<R, F, Sch, C, PAcc> }
  : PathLeaf<Sch, C, PAcc>;

type ParamCallNode<
  Segs extends readonly string[],
  F,
  Sch extends SearchTypes,
  C,
  PAcc extends Params
> = ParamRun<Segs, F> extends {
  args: infer A extends readonly unknown[];
  params: infer P2 extends Params;
  rest: infer R2 extends readonly string[];
}
  ? ((...args: A) => PathNode<R2, F, Sch, C, PAcc & P2>) &
      (R2 extends readonly [] ? { (...args: [...A, Sch["input"], string?]): string } : {}) &
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
      : PathNode<SegmentsOf<P>, FiltersOf<Def>, SearchTypesOf<Def>, ChildrenOf<Def>, PAcc>
    : any
  : ChildPaths<ChildrenOf<Def>, PAcc>;

type MultiPathContrib<
  Ps extends readonly string[],
  Def,
  PAcc extends Params
> = Ps extends readonly [infer H extends string, ...infer T extends readonly string[]]
  ? PathNode<SegmentsOf<H>, FiltersOf<Def>, SearchTypesOf<Def>, ChildrenOf<Def>, PAcc> &
      MultiPathContrib<T, Def, PAcc>
  : {};

/**
 * The type of a router instance's `paths` proxy for a given route tree.
 * Requires the tree to be a literal tuple (`as const` or a `const` type
 * param); non-literal trees fall back to an untyped proxy.
 */
export type RoutePaths<R extends readonly RouteDefinition[]> = number extends R["length"]
  ? any
  : PathEnd<DefaultSearchTypes, {}> & TuplePaths<R, {}>;

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
