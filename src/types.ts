import type { Component, JSX, Signal } from "solid-js";

declare module "solid-js/web" {
  interface RequestEvent {
    response: {
      status?: number;
      statusText?: string;
      headers: Headers
    };
    router? : {
      matches?: OutputMatch[];
      cache?: Map<string, CacheEntry>;
      submission?: {
        input: any;
        result: any;
        url: string;
      };
      dataOnly?: boolean | string[];
      data?: Record<string, any>;
      previousUrl?: string;
    }
    serverOnly?: boolean;
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
  rawPath?: string;
}
export interface RouterIntegration {
  signal: Signal<LocationChange>;
  create?: (router: RouterContext) => void;
  utils?: Partial<RouterUtils>;
}

export type Intent = "initial" | "native" | "navigate" | "preload";
export interface RoutePreloadFuncArgs {
  params: Params;
  location: Location;
  intent: Intent;
}

export type RoutePreloadFunc<T = unknown> = (args: RoutePreloadFuncArgs) => T;

export interface RouteSectionProps<T = unknown> {
  params: Params;
  location: Location;
  data: T;
  children?: JSX.Element;
}

export type RouteDefinition<S extends string | string[] = any, T = unknown> = {
  path?: S;
  matchFilters?: MatchFilters<S>;
  preload?: RoutePreloadFunc<T>;
  children?: RouteDefinition | RouteDefinition[];
  component?: Component<RouteSectionProps<T>>;
  info?: Record<string, any>;
  /** @deprecated use preload */
  load?: RoutePreloadFunc;
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
  route: RouteDescription;
}

export interface OutputMatch {
  path: string;
  pattern: string;
  match: string;
  params: Params;
  info?: Record<string, any>;
}

export interface RouteDescription {
  key: unknown;
  originalPath: string;
  pattern: string;
  component?: Component<RouteSectionProps>;
  preload?: RoutePreloadFunc;
  matcher: (location: string) => PathMatch | null;
  matchFilters?: MatchFilters;
  info?: Record<string, any>;
}

export interface Branch {
  routes: RouteDescription[];
  score: number;
  matcher: (location: string) => RouteMatch[] | null;
}

export interface RouteContext {
  parent?: RouteContext;
  child?: RouteContext;
  pattern: string;
  path: () => string;
  outlet: () => JSX.Element;
  resolvePath(to: string): string | undefined;
}

export interface RouterUtils {
  renderPath(path: string): string;
  parsePath(str: string): string;
  go(delta: number): void;
  beforeLeave: BeforeLeaveLifecycle;
  paramsWrapper: (getParams: () => Params, branches: () => Branch[]) => Params;
  queryWrapper: (getQuery: () => Params) => Params;
}

export interface RouterContext {
  base: RouteContext;
  location: Location;
  params: Params;
  navigatorFactory: NavigatorFactory;
  isRouting: () => boolean;
  matches: () => RouteMatch[];
  renderPath(path: string): string;
  parsePath(str: string): string;
  beforeLeave: BeforeLeaveLifecycle;
  preloadRoute: (url: URL, preloadData?: boolean) => void;
  singleFlight: boolean;
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
  readonly error: any;
  readonly pending: boolean;
  readonly url: string;
  clear: () => void;
  retry: () => void;
};

export type SubmissionStub = {
  readonly input: undefined;
  readonly result: undefined;
  readonly error: undefined;
  readonly pending: undefined;
  readonly url: undefined;
  clear: () => void;
  retry: () => void;
};

export interface MaybePreloadableComponent extends Component {
  preload?: () => void;
}

export type CacheEntry = [number, Promise<any>, any, Intent | undefined, Signal<number> & { count: number }];

export type NarrowResponse<T> = T extends CustomResponse<infer U> ? U : Exclude<T, Response>;
export type RouterResponseInit = Omit<ResponseInit, "body"> & { revalidate?: string | string[] };
// export type CustomResponse<T> = Response & { customBody: () => T };
// hack to avoid it thinking it inherited from Response
export type CustomResponse<T> = Omit<Response, "clone"> & { customBody: () => T; clone(...args: readonly unknown[]): CustomResponse<T> };

/** @deprecated */
export type RouteLoadFunc = RoutePreloadFunc;
/** @deprecated */
export type RouteLoadFuncArgs = RoutePreloadFuncArgs;