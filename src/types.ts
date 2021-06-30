import { JSX } from "solid-js";

export type Params = Record<string, string>;

export type RouteRenderFunc = (router: RouterState, route: RouteState) => JSX.Element;

export interface RouteDefinition {
  path: string;
  element: JSX.Element | RouteRenderFunc;
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
  element: RouteRenderFunc;
  matcher: (location: string) => RouteMatch | null;
}

export interface MatchedRoute {
  route: Route;
  score: number;
  params: Params;
  path: string;
}

export interface RouteState {
  pattern: string;
  path: string;
  params: Params;
  outlet: JSX.Element;
  resolvePath: (to: string) => string | undefined;
}

export interface RouterLocation {
  readonly path: string;
  readonly queryString: string;
}

export interface RouterState {
  readonly base: string;
  readonly location: RouterLocation;
  readonly query: Params;
  //isRouting: () => boolean;
  //utils: RouterUtils;
  //push(to: string, options?: RedirectOptions): void;
  //replace(to: string, options?: RedirectOptions): void;
}
