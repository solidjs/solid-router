import { analyzeModule, getExportName, getLocalExportName } from "./analyze.ts";
import type { RouteManifestEntry } from "./manifest.ts";
import { BaseFileSystemRouter, cleanPath } from "./router.ts";

/**
 * The filename convention proven by SolidStart:
 * - `index` files map to their directory's path
 * - `[param]` maps to `:param`
 * - `[[param]]` maps to an optional `:param?`
 * - `[...rest]` maps to a catch-all `*rest`
 * - `(group)` segments are retained for emission adapters to nest and strip
 */
export function routePathFromFile(routeFile: string): string {
  const routePath = routeFile
    // remove the initial slash
    .slice(1)
    .replace(/index$/, "")
    .replace(/\[([^/]+)\]/g, (_, m) => {
      if (m.length > 3 && m.startsWith("...")) {
        return `*${m.slice(3)}`;
      }
      if (m.length > 2 && m.startsWith("[") && m.endsWith("]")) {
        return `:${m.slice(1, -1)}?`;
      }
      return `:${m}`;
    });

  return routePath?.length > 0 ? `/${routePath}` : "/";
}

/**
 * The page-module convention proven by SolidStart: a route module is a page
 * when it has a default export, and may export a `route` config object.
 * `.md`/`.mdx` files are always pages.
 *
 * Server conventions (`GET`, `POST`, … exports) intentionally do not live
 * here — they belong to the server framework, which can extend this class.
 */
export class PageFileSystemRouter extends BaseFileSystemRouter {
  toPath(src: string): string | undefined {
    if (this.config.toPath) return super.toPath(src);
    return routePathFromFile(cleanPath(src, this.config));
  }

  toRoute(src: string): RouteManifestEntry | undefined {
    if (this.config.toRoute) return super.toRoute(src);

    const path = this.toPath(src);
    if (path === undefined) return;

    if (src.endsWith(".md") || src.endsWith(".mdx")) {
      return {
        page: true,
        $component: {
          src: src,
          pick: ["$css"]
        },
        $$route: undefined,
        path
      };
    }

    const exports = analyzeModule(src);
    const exportNames = exports.map(getExportName);
    const localExportNames = exports.map(getLocalExportName).filter(name => name !== undefined);
    const hasDefault = exportNames.includes("default");
    const hasRouteConfig = exportNames.includes("route");
    if (hasDefault) {
      return {
        page: true,
        $component: {
          src: src,
          pick: [...localExportNames.filter(name => name !== "route"), "default", "$css"]
        },
        $$route: hasRouteConfig
          ? {
              src: src,
              pick: ["route"]
            }
          : undefined,
        path
      };
    }
  }
}
