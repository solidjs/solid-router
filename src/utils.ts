import { createMemo, getOwner, runWithOwner } from "solid-js";
import type { Params, PathMatch, Route, SetParams } from "./types";

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|\/+$/g;

function normalize(path: string, omitSlash: boolean = false) {
  const s = path.replace(trimPathRegex, "");
  return s ? (omitSlash || /^[?#]/.test(s) ? s : "/" + s) : "";
}

export function resolvePath(base: string, path: string, from?: string): string | undefined {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }
  const basePath = normalize(base);
  const fromPath = from && normalize(from);
  let result = "";
  if (!fromPath || path.startsWith("/")) {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return (result || "/") + normalize(path, !result);
}

export function invariant<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

export function joinPaths(from: string, to: string): string {
  return normalize(from).replace(/\/*(\*.*)?$/g, "") + normalize(to);
}

export function extractSearchParams(url: URL): Params {
  const params: Params = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export function urlDecode(str: string, isQuery?: boolean) {
  return decodeURIComponent(isQuery ? str.replace(/\+/g, " ") : str);
}

export function createMatcher(path: string, partial?: boolean) {
  const [pattern, splat] = path.split("/*", 2);
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
      } else if (segment.localeCompare(locSegment, undefined, { sensitivity: "base" }) !== 0) {
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

export function scoreRoute(route: Route): number {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce(
    (score, segment) => score + (segment.startsWith(":") ? 2 : 3),
    segments.length - (splat === undefined ? 0 : 1)
  );
}

export function createMemoObject<T extends Record<string | symbol, unknown>>(fn: () => T): T {
  const map = new Map();
  const owner = getOwner()!;
  return new Proxy(<T>{}, {
    get(_, property) {
      if (!map.has(property)) {
        runWithOwner(owner, () =>
          map.set(
            property,
            createMemo(() => fn()[property])
          )
        );
      }
      return map.get(property)();
    },
    getOwnPropertyDescriptor() {
      return {
        enumerable: true,
        configurable: true
      };
    },
    ownKeys() {
      return Reflect.ownKeys(fn());
    }
  });
}

export function mergeSearchString(search: string, params: SetParams) {
  const merged = new URLSearchParams(search);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") {
      merged.delete(key);
    } else {
      merged.set(key, String(value));
    }
  });
  const s = merged.toString();
  return s ? `?${s}` : "";
}

export function expandOptionals(pattern: string): string[] {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match) return [pattern];

  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes: string[] = [prefix, (prefix += match[1])];

  // This section handles adjacent optional params. We don't actually want all permuations since
  // that will lead to equivalent routes which have the same number of params. For example
  // `/:a?/:b?/:c`? only has the unique expansion: `/`, `/:a`, `/:a/:b`, `/:a/:b/:c` and we can
  // discard `/:b`, `/:c`, `/:b/:c` by building them up in order and not recursing. This also helps
  // ensure predictability where earlier params have precidence.
  while ((match = /^(\/\:[^\/]+)\?/.exec(suffix))) {
    prefixes.push((prefix += match[1]));
    suffix = suffix.slice(match[0].length);
  }

  return expandOptionals(suffix).reduce<string[]>(
    (results, expansion) => [...results, ...prefixes.map(p => p + expansion)],
    []
  );
}
