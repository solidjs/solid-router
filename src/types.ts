import { Component, JSX } from "solid-js";

export type Params = Record<string, string>;

export type RouteData = Record<string, any>;

export type RouteUpdateMode = "push" | "replace" | "init";

export interface RouteUpdate {
  value: string;
  mode?: RouteUpdateMode;
}

export interface RouterIntegration {
  signal: RouteUpdateSignal;
  utils?: Partial<RouterUtils>;
}

export type RouteUpdateSignal = [() => RouteUpdate, (value: RouteUpdate) => void];

export type RouteDataFunc = (route: RouteState, router: RouterState) => RouteData | undefined;

export interface RouteDefinition {
  path: string;
  element: JSX.Element | Component;
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
  element: (route: RouteState) => JSX.Element;
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
  path: string;
  params: Params;
  outlet: () => JSX.Element;
  resolvePath: (to: string) => string | undefined;
}

export interface RouterLocation {
  readonly path: string;
  readonly queryString: string;
}

export interface RouterUtils {
  renderPath(path: string): string;
}

export interface RedirectOptions {
  resolve: boolean;
}

export interface RouterState {
  readonly base: string;
  readonly location: RouterLocation;
  readonly query: Params;
  isRouting: () => boolean;
  utils: RouterUtils;
  push(to: string, options?: RedirectOptions): void;
  replace(to: string, options?: RedirectOptions): void;
}
