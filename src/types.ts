import { Component, JSX } from "solid-js";

export type Params = Record<string, string>;

export type LocationState = string | null;

export type RouteData = Record<string, any>;

export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

export interface Location<S extends LocationState = LocationState> extends Path {
  query: Params;
  state: S;
  key: string;
}

export interface NavigateOptions {
  resolve: boolean;
  replace: boolean;
  state: LocationState;
}

export interface Navigator {
  (to: string, options?: Partial<NavigateOptions>): void;
  (to: number): void;
}

export interface LocationChange {
  value: string;
  replace?: boolean;
}

export type LocationChangeSignal = [() => LocationChange, (next: LocationChange) => void];

export interface RouterIntegration {
  signal: LocationChangeSignal;
  utils?: Partial<RouterUtils>;
}

export type RouteDataFunc = (args: {
  params: Params;
  location: Location;
  navigate: Navigator;
}) => RouteData | undefined;

export type RouteDefinition = {
  path: string;
  data?: RouteDataFunc;
  children?: RouteDefinition[];
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
  score: number;
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
  originalPath: string;
  pattern: string;
  children?: Route[];
  element: () => JSX.Element;
  preload?: () => void;
  data?: RouteDataFunc;
  matcher: (location: string) => PathMatch | null;
}

export interface RouteContext {
  parent?: RouteContext;
  child?: RouteContext;
  data?: RouteData;
  pattern: string;
  params: Params;
  path: () => string;
  outlet: () => JSX.Element;
  resolvePath(to: string): string | undefined;
}

export interface RouterUtils {
  renderPath(path: string): string;
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
  navigate: Navigator;
  isRouting: () => boolean;
  renderPath(path: string): string;
}
