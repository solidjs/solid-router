/**
 * Arbitrary metadata attached to routes via `info`, surfaced through
 * `useRouteMatches` and the instance's `match()`. Declared here — in the
 * package entry — so apps can augment it for typed, discoverable metadata:
 *
 * ```ts
 * declare module "@solidjs/router" {
 *   interface RouteInfo {
 *     breadcrumb?: string;
 *   }
 * }
 * ```
 *
 * Declared keys are type-checked at route definitions and typed on reads;
 * undeclared keys remain freeform.
 */
export interface RouteInfo {
  [key: string]: any;
}

export * from "./routers/index.js";
export * from "./lifecycle.js";
export {
  useHref,
  useIsRouting,
  useLinkState,
  useLocation,
  useMatch,
  useNavigate,
  usePreloadRoute,
  useParams,
  useResolvedPath,
  useRouteMatches,
  useSearchParams,
  RouterContextObj as RouterContext
} from "./routing.js";
export type { LinkState } from "./routing.js";
export { mergeSearchString as _mergeSearchString } from "./utils.js";
export { int } from "./paths.js";
export type { RoutePaths, PathParamsOf, PathEnd, TypedMatchFilter, DefaultSearchTypes } from "./paths.js";
export * from "./data/index.js";
export type {
  Location,
  LocationChange,
  SearchParams,
  MatchFilter,
  MatchFilters,
  NavigateOptions,
  Navigator,
  OutputMatch,
  Params,
  PathMatch,
  RouteComponent,
  RouteParams,
  RouteProps,
  RouteSectionProps,
  RoutePreloadFunc,
  RoutePreloadFuncArgs,
  RouteDefinition,
  RouteDescription,
  RouteMatch,
  RouterIntegration,
  RouterUtils,
  SetParams,
  SetSearchParams,
  Submission,
  BeforeLeaveEventArgs,
  TypedPath,
  TypedSearchPath,
  StandardSchemaV1
} from "./types.js";
