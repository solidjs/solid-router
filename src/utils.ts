import { createMemo, getOwner, runWithOwner } from "solid-js";
import type { Params, PathMatch, Route } from "./types";

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|\/+$|\s+/;

function normalize(path: string) {
  const s = path.replace(trimPathRegex, "");
  return s ? "/" + s : "";
}

export function resolvePath(base: string, path: string, from?: string): string | undefined {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }

  const basePath = normalize(base);
  const fromPath = from && normalize(from);
  let result = "";
  if (!fromPath || path.charAt(0) === "/") {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return result + normalize(path) || "/";
}

export function invariant<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

export function toArray<T>(items: T | T[]): T[] {
  return Array.isArray(items) ? items : [items];
}

export function joinPaths(from: string, to: string): string {
  return to ? `${from.replace(/[/*]+$/, "")}/${to.replace(/^\/+/, "")}` : from;
}

export function extractQuery(url: URL): Params {
  const query: Params = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

export function createMatcher(path: string, partial?: boolean) {
  const [pattern, splat] = path.split("/*", 2)
  const segments = pattern.split("/").filter(Boolean);
  const len = segments.length;

  return (location: string): PathMatch | null => {
    const locSegments = location.split("/").filter(Boolean);
    const lenDiff = locSegments.length - len;
    if (lenDiff < 0 || (lenDiff > 0 && splat === undefined && !partial)) {
      return null;
    }

    const match: PathMatch = {
      path: len ? "" : "/",
      params: {}
    };

    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      const locSegment = locSegments[i];

      if (segment[0] === ":") {
        match.params[segment.slice(1)] = locSegment;
      } else if (segment.localeCompare(locSegment, undefined, { sensitivity: 'base' }) !== 0) {
        return null;
      }
      match.path += `/${locSegment}`;
    }

    if (splat) {
      match.params[splat] = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
    }

    return match;
  }
}

export function scoreRoute(route: Route): number {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce(
    (score, segment) => score + (segment.startsWith(":") ? 2 : 3),
    segments.length - (splat === undefined ? 0 : 1)
  );
}

export function createMemoObject<T extends object>(fn: () => T): T {
  const map = new Map();
  const owner = getOwner()!;
  return new Proxy(
    {},
    {
      get(_, property) {
        const memo =
          map.get(property) ||
          runWithOwner(owner, () => {
            const p = createMemo(() => (fn() as any)[property]);
            map.set(property, p);
            return p;
          });
        return memo();
      }
    }
  ) as T;
}
