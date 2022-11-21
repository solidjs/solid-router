import { Accessor, Component, JSX } from "solid-js";

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

export interface RouteDataFuncArgs<T = unknown> {
  data: T extends RouteDataFunc ? ReturnType<T> : T;
  params: Params;
  location: Location;
  navigate: Navigator;
}

export type RouteDataFunc<T = unknown, R = unknown> = (args: RouteDataFuncArgs<T>) => R;

export type RouteDefinition = {
  path: string | string[];
  data?: RouteDataFunc;
  preload?: any;
  children?: RouteDefinition | RouteDefinition[];
} & (
  | {
      element?: never;
      component: Component;
    }
  | {
      component?: never;
      element?: JSX.Element;
      preload?: () => void;
    }
);

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
  key: any,
  originalPath: string;
  pattern: string;
  element: () => JSX.Element;
  preload?: () => void;
  data?: RouteDataFunc;
  matcher: (location: string) => PathMatch | null;
}

export interface key_guard {
  guard?: Accessor<string | false>
}

export interface Branch {
  routes: Route[];
  score: number;
  matcher: (location: string) => RouteMatch[] | null;
}

export interface RouteContext extends key_guard {
  parent?: RouteContext;
  child?: RouteContext;
  data?: unknown;
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
  out?: RouterOutput;
  location: Location;
  navigatorFactory: NavigatorFactory;
  isRouting: () => boolean;
  renderPath(path: string): string;
  parsePath(str: string): string;
  beforeLeave: BeforeLeaveLifecycle;
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
  location: Location
  navigate: Navigator;
}

export interface BeforeLeaveLifecycle {
  subscribe(listener: BeforeLeaveListener): () => void;
  confirm(to: string | number, options?: Partial<NavigateOptions>): boolean;
}
