import type { RouteMatch } from "./types";

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
  return `${from.replace(/[/*]+$/, "")}/${to.replace(/^\/+/, "")}`;
}

export function createPath(path: string, base: string, hasChildren: boolean = false): string {
  const joined = joinPaths(base, path);
  return hasChildren && !joined.endsWith("*") ? joinPaths(joined, "*") : joined;
}

export function extractQuery(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

export function createLocationMatcher(path: string, end?: boolean) {
  const [pathname] = path.split(/[?#]/, 1);
  return (location: string) => {
    if (end) {
      return location.toLowerCase() === pathname.toLowerCase();
    }
    return location.toLowerCase().startsWith(pathname.toLowerCase());
  };
}

export function createPathMatcher(
  path: string,
  index: number = 0
): (location: string) => RouteMatch | null {
  const [pattern, splat] = path.split(/^\*|\/\*/, 2);
  const segments = pattern.toLowerCase().split("/").filter(Boolean);
  const segmentsLen = segments.length;
  const isSplat = splat !== undefined;

  return (location: string) => {
    const locSegments = location.toLowerCase().split("/").filter(Boolean);
    const locLen = locSegments.length;
    const lenDiff = locLen - segmentsLen;
    if (lenDiff < 0 || (lenDiff > 0 && !isSplat)) {
      return null;
    }

    const match: RouteMatch = {
      score: (lenDiff ? 2000 : 1000) + index,
      path: segmentsLen ? "" : "/",
      params: {}
    };

    for (let i = 0; i < segmentsLen; i++) {
      const segment = segments[i];
      const locSegment = locSegments[i];

      if (segment === locSegment) {
        match.score += 3000;
      } else if (segment[0] === ":") {
        match.score += 2000;
        match.params[segment.slice(1)] = locSegment;
      } else {
        return null;
      }
      match.path += `/${locSegment}`;
    }
    
    if (splat) {
      match.params[splat] = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
    }

    return match;
  };
}
