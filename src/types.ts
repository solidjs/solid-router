import { Component, JSX } from "solid-js";

export type Params = Record<string, string>;

export type LocationState = string | null;

export type RouteData = Record<string, any>;

export type RouteUpdateMode = "push" | "replace" | "init";

export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

export interface Location<S extends LocationState = LocationState> extends Path {
  query: Params,
  state: S;
  key: string;
}

export interface NavigateOptions {
  resolve: boolean;
  replace: boolean;
  state: LocationState;
}

export interface Navigate {
  (to: string, options?: Partial<NavigateOptions>): void;
  (to: number): void;
}

export interface RouteUpdate {
  value: string;
  mode?: RouteUpdateMode;
}

export interface RouterIntegration {
  signal: RouteUpdateSignal;
  utils?: Partial<RouterUtils>;
}

export type RouteUpdateSignal = [() => RouteUpdate, (value: RouteUpdate) => void];

export interface RouteArgs<T extends Params = Params> {
  params: T;
  location: Location;
  navigate: Navigate;
}

export type RouteDataFunc = (args: RouteArgs) => RouteData | undefined;

export interface RouteDefinition {
  path: string;
  element?: JSX.Element | Component;
  data?: RouteDataFunc;
  children?: RouteDefinition[];
}

export interface RouteMatch {
  score: number;
  params: Params;
  path: string;
}

export interface Route {
  originalPath: string;
  pattern: string;
  children?: Route[];
  element: () => JSX.Element;
  data?: RouteDataFunc;
  matcher: (location: string) => RouteMatch | null;
}

export interface MatchedRoute {
  route: Route;
  score: number;
  params: Params;
  path: string;
}

export interface RouteState {
  parent?: RouteState;
  child?: RouteState;
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

export interface RouterState {
  base: RouteState;
  location: Location;
  navigate: Navigate;
  isRouting: () => boolean;
  renderPath(path: string): string;
}
