import { relative, resolve } from "node:path";
import type { PluginOption } from "vite";

import { PageFileSystemRouter } from "../convention.ts";
import { BaseFileSystemRouter, normalizePath } from "../router.ts";
import { DEFAULT_EXTENSIONS, moduleId } from "./constants.ts";
import { fileSystemWatcher } from "./fs-watcher.ts";
import { treeShake } from "./tree-shake.ts";

export { DEFAULT_EXTENSIONS, moduleId };
export { treeShake } from "./tree-shake.ts";
export { fileSystemWatcher } from "./fs-watcher.ts";

export interface FileRoutesOptions {
  /** Route directory, relative to the Vite root. Defaults to `src/routes`. */
  dir?: string;
  /** File extensions that participate in routing. Defaults to js/jsx/ts/tsx. */
  extensions?: string[];
  /**
   * A custom file-system router (scanning + convention) used for every Vite
   * environment. Defaults to a `PageFileSystemRouter` over `dir`.
   */
  router?: BaseFileSystemRouter;
  /**
   * Per-environment file-system routers, keyed by Vite environment name.
   * Frameworks (e.g. SolidStart) use this to serve different conventions to
   * client and server environments. Falls back to `router` for environments
   * not listed.
   */
  routers?: Record<string, BaseFileSystemRouter>;
}

/**
 * The Vite delivery adapter for `@solidjs/file-routes`.
 *
 * Serializes the neutral route manifest into the `solid:file-routes` virtual
 * module — module refs become code-split dynamic imports (`$`-prefixed keys)
 * or eagerly required static imports (`$$`-prefixed keys) — and keeps it hot
 * as route files are added, changed and removed.
 */
export function fileRoutes(options: FileRoutesOptions = {}): PluginOption[] {
  let defaultRouter = options.router;

  const getRouter = (environment: string) => options.routers?.[environment] ?? defaultRouter;

  return [
    {
      name: "solid-file-routes",
      enforce: "pre",
      config() {
        return {
          optimizeDeps: {
            // The emission adapter imports the virtual module, which only
            // this plugin can resolve; keep it out of esbuild prebundling.
            exclude: ["@solidjs/router/fs"]
          }
        };
      },
      configResolved(config) {
        if (!defaultRouter) {
          defaultRouter = new PageFileSystemRouter({
            dir: normalizePath(resolve(config.root, options.dir ?? "src/routes")),
            extensions: options.extensions ?? DEFAULT_EXTENSIONS
          });
        }
      },
      resolveId(id) {
        if (id === moduleId) return id;
      },
      async load(id) {
        if (id !== moduleId) return;

        const root = this.environment.config.root;
        const isBuild = this.environment.mode === "build";
        const js = jsCode();

        const router = getRouter(this.environment.name);
        const routes = router ? await router.getRoutes() : [];

        let routesCode = JSON.stringify(routes ?? [], (k, v) => {
          if (v === undefined) return undefined;

          if (k.startsWith("$$")) {
            const buildId = `${v.src}?${v.pick.map((p: any) => `pick=${p}`).join("&")}`;

            const refs: Record<string, string> = {};
            for (const pick of v.pick) {
              refs[pick] = js.addNamedImport(pick, buildId);
            }
            return {
              require: `_$() => ({ ${Object.entries(refs)
                .map(([pick, namedImport]) => `'${pick}': ${namedImport}`)
                .join(", ")} })$_`
            };
          } else if (k.startsWith("$")) {
            const buildId = `${v.src}?${v.pick.map((p: any) => `pick=${p}`).join("&")}`;
            return {
              src: relative(root, buildId),
              build: isBuild ? `_$() => import('${buildId}')$_` : undefined,
              import: `_$() => import('${buildId}')$_`
            };
          }
          return v;
        });

        routesCode = routesCode.replaceAll('"_$(', "(").replaceAll(')$_"', ")");

        return `
${js.getImportStatements()}
export default ${routesCode}`;
      }
    },
    treeShake(),
    fileSystemWatcher(getRouter)
  ];
}

function jsCode() {
  const imports = new Map<string, Record<string, string>>();
  let vars = 0;

  function addNamedImport(name: string, source: string) {
    let names = imports.get(source);
    if (!names) {
      names = {};
      imports.set(source, names);
    }

    const alias = "routeData" + vars++;
    names[name] = alias;
    return alias;
  }

  const getImportStatements = () => {
    return [...imports.entries()]
      .map(
        ([source, names]) =>
          `import { ${Object.entries(names)
            .map(([name, alias]) => `${name} as ${alias}`)
            .join(", ")} } from '${source}';`
      )
      .join("\n");
  };

  return {
    addNamedImport,
    getImportStatements
  };
}
