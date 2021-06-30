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

export function createMatcher(
  path: string,
  index: number
): (location: string) => RouteMatch | null {
  const isSplat = path.endsWith("/*");
  const pathParts = path.toLowerCase().split("/").filter(Boolean);
  if (isSplat) {
    pathParts.pop();
  }
  const pathLen = pathParts.length;

  return (location: string, index: number = 0) => {
    const locParts = location.toLowerCase().split("/").filter(Boolean);
    const locLen = locParts.length;
    if (pathLen > locLen || (pathLen < locLen && !isSplat)) {
      return null;
    }

    const match: RouteMatch = {
      score: 1000 + index,
      path: pathParts.length ? "" : "/",
      params: {}
    };

    for (let i = 0; i < pathLen; i++) {
      const pathPart = pathParts[i];
      const locPart = locParts[i];

      if (pathPart === locPart) {
        match.score += 3000;
      } else if (pathPart[0] === ":") {
        match.score += 2000;
        match.params[pathPart.slice(1)] = locPart;
      } else if (pathPart === "*") {
        match.score += 1000;
      } else {
        return null;
      }
      match.path += `/${locPart}`;
    }

    return match;
  };
}
