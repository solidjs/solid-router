import { Component, JSX, Signal } from "solid-js";

declare module "solid-js/web" {
  interface RequestEvent {
    response?: Response;
    routerCache?: Map<any, any>;
  }
}

export type Params = Record<string, string>;

export type SetParams = Record<string, string | number | boolean | null | undefined>;

export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

export interface Location<S = unknown> extends Path {
  query: Params;
  state: Readonly<Partial<S>> | null;
  key: string;
}

export interface NavigateOptions<S = unknown> {
  resolve: boolean;
  replace: boolean;
  scroll: boolean;
  state: S;
}

export interface Navigator {
  (to: string, options?: Partial<NavigateOptions>): void;
  (delta: number): void;
}

export type NavigatorFactory = (route?: RouteContext) => Navigator;

export interface LocationChange<S = unknown> {
  value: string;
  replace?: boolean;
  scroll?: boolean;
  state?: S;
}

export type LocationChangeSignal = [() => LocationChange, (next: LocationChange) => void];

export interface RouterIntegration {
  signal: LocationChangeSignal;
  utils?: Partial<RouterUtils>;
}

export interface RouteLoadFuncArgs {
  params: Params;
  location: Location;
}

export type RouteLoadFunc = (args: RouteLoadFuncArgs) => void;

export interface RouteSectionProps  extends RouteLoadFuncArgs {
  children?: JSX.Element;
}

export type RouteDefinition<S extends string | string[] = any> = {
  path: S;
  matchFilters?: MatchFilters<S>;
  load?: RouteLoadFunc;
  children?: RouteDefinition | RouteDefinition[];
  component?: Component<RouteSectionProps>;
};

export type MatchFilter = readonly string[] | RegExp | ((s: string) => boolean);

export type PathParams<P extends string | readonly string[]> =
  P extends `${infer Head}/${infer Tail}`
    ? [...PathParams<Head>, ...PathParams<Tail>]
    : P extends `:${infer S}?`
    ? [S]
    : P extends `:${infer S}`
    ? [S]
    : P extends `*${infer S}`
    ? [S]
    : [];

export type MatchFilters<P extends string | readonly string[] = any> = P extends string
  ? { [K in PathParams<P>[number]]?: MatchFilter }
  : Record<string, MatchFilter>;

export interface PathMatch {
  params: Params;
  path: string;
}

export interface RouteMatch extends PathMatch {
  route: Route;
}

export interface OutputMatch {
  originalPath: string;
  pattern: string;
  path: string;
  params: Params;
}

export interface Route {
  key: unknown;
  originalPath: string;
  pattern: string;
  component?: Component<RouteSectionProps>;
  load?: RouteLoadFunc;
  matcher: (location: string) => PathMatch | null;
  matchFilters?: MatchFilters;
}

export interface Branch {
  routes: Route[];
  score: number;
  matcher: (location: string) => RouteMatch[] | null;
}

export interface RouteContext {
  parent?: RouteContext;
  child?: RouteContext;
  pattern: string;
  params: Params;
  path: () => string;
  outlet: () => JSX.Element;
  resolvePath(to: string): string | undefined;
}

export interface RouterUtils {
  renderPath(path: string): string;
  parsePath(str: string): string;
  go(delta: number): void;
  beforeLeave: BeforeLeaveLifecycle;
}

export interface OutputMatch {
  originalPath: string;
  pattern: string;
  path: string;
  params: Params;
}

export interface RouterOutput {
  url?: string;
  matches: OutputMatch[][];
}

export interface RouterContext {
  base: RouteContext;
  location: Location;
  navigatorFactory: NavigatorFactory;
  isRouting: () => boolean;
  renderPath(path: string): string;
  parsePath(str: string): string;
  beforeLeave: BeforeLeaveLifecycle;
  submissions: Signal<Submission<any, any>[]>;
}

export interface BeforeLeaveEventArgs {
  from: Location;
  to: string | number;
  options?: Partial<NavigateOptions>;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  retry(force?: boolean): void;
}

export interface BeforeLeaveListener {
  listener(e: BeforeLeaveEventArgs): void;
  location: Location;
  navigate: Navigator;
}

export interface BeforeLeaveLifecycle {
  subscribe(listener: BeforeLeaveListener): () => void;
  confirm(to: string | number, options?: Partial<NavigateOptions>): boolean;
}

export type Submission<T, U> = {
  readonly input: T;
  readonly result?: U;
  readonly pending: boolean;
  readonly url: string;
  clear: () => void;
  retry: () => void;
};