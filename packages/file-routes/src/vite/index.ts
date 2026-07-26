import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { PluginOption } from "vite";

import { PageFileSystemRouter, type PageFileSystemRouterConfig } from "../convention.ts";
import type { ModuleRef } from "../manifest.ts";
import { BaseFileSystemRouter, normalizePath } from "../router.ts";
import { buildRouteTree, type RouteTreeEntry } from "../tree.ts";
import { DEFAULT_EXTENSIONS, moduleId } from "./constants.ts";
import { fileSystemWatcher } from "./fs-watcher.ts";
import { treeShake } from "./tree-shake.ts";
import { serializeTypes } from "./types.ts";

export { DEFAULT_EXTENSIONS, moduleId };
export { treeShake } from "./tree-shake.ts";
export { fileSystemWatcher } from "./fs-watcher.ts";

export interface FileRoutesOptions
  extends Pick<PageFileSystemRouterConfig, "components" | "httpMethods" | "toPath" | "toRoute"> {
  /** Route directory, relative to the Vite root. Defaults to `src/routes`. */
  dir?: string;
  /** File extensions that participate in routing. Defaults to js/jsx/ts/tsx. */
  extensions?: string[];
  /**
   * A custom file-system router (scanning + convention) used for every Vite
   * environment. Defaults to a `PageFileSystemRouter` over `dir`, configured
   * with the convention options above.
   */
  router?: BaseFileSystemRouter;
  /**
   * Per-environment file-system routers, keyed by Vite environment name.
   * Frameworks (e.g. SolidStart) use this to serve different conventions to
   * client and server environments. Falls back to `router` for environments
   * not listed.
   */
  routers?: Record<string, BaseFileSystemRouter>;
  /** The id the route manifest is served from. Defaults to `virtual:file-routes`. */
  moduleId?: string;
  /**
   * Vite environments whose build should take every route module as an
   * entry, so routes are code-split into their own chunks. Frameworks pass
   * their browser environment's name; the inputs are added to whatever the
   * framework already configures.
   */
  buildInputs?: string | string[];
  /**
   * Packages that import the virtual module and must therefore stay out of
   * esbuild's dependency prebundling, which cannot resolve it. Defaults to
   * `@solidjs/router/fs`, the emission adapter shipped alongside this
   * package; pass your own list (or `[]`) for other routers.
   */
  optimizeDepsExclude?: string[];
  /**
   * Write a declaration for the virtual module typing the manifest as a
   * literal tuple, and keep it in step with the route directory. Routers
   * that derive types from their route table need this: a runtime array
   * tells them nothing, so path-derived types silently degrade without it.
   *
   * `true` writes `file-routes.d.ts` next to the Vite root; pass a path to
   * put it elsewhere. The generated file is self-contained — reference it
   * *instead of* `@solidjs/file-routes/types`, never both.
   */
  types?: boolean | string;
}

/**
 * The Vite delivery adapter for `@solidjs/file-routes`.
 *
 * Serializes the neutral route manifest into the virtual module — module refs
 * become code-split dynamic imports (`$`-prefixed keys) or eagerly required
 * static imports (`$$`-prefixed keys) — and keeps it hot as route files are
 * added, changed and removed.
 *
 * The module serves two views of the same entries: the default export is the
 * flat manifest, and `pageRoutes` is the page entries nested by path with
 * `(group)` segments stripped, so emission adapters don't each reimplement
 * the tree.
 */
export function fileRoutes(options: FileRoutesOptions = {}): PluginOption[] {
  const virtualId = options.moduleId ?? moduleId;
  const buildInputs =
    options.buildInputs === undefined
      ? []
      : Array.isArray(options.buildInputs)
        ? options.buildInputs
        : [options.buildInputs];

  let defaultRouter = options.router;
  let root = process.cwd();

  const getRouter = (environment: string) => options.routers?.[environment] ?? defaultRouter;

  /**
   * The manifest the declaration describes. With per-environment routers the
   * browser's is the one an app's routes are built from, so it wins.
   */
  const typesRouter = () => getRouter("client");

  const typesFile = () =>
    options.types === undefined || options.types === false
      ? undefined
      : resolve(root, options.types === true ? "file-routes.d.ts" : options.types);

  async function writeTypes() {
    const file = typesFile();
    const router = typesRouter();
    if (!file || !router) return;

    const routes = (await router.getRoutes()) ?? [];
    const contents = serializeTypes(
      virtualId,
      routes,
      buildRouteTree(routes.filter(route => route.page))
    );

    // Only touch the file when it actually changes: every environment calls
    // this, and rewriting it would churn the watcher for no reason.
    let previous;
    try {
      previous = readFileSync(file, "utf-8");
    } catch {}
    if (previous === contents) return;

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }

  /** The id a route module ref is loaded from: its source plus its picks. */
  const toModuleId = (ref: ModuleRef) =>
    `${ref.src}?${ref.pick.map(pick => `pick=${pick}`).join("&")}`;

  return [
    {
      name: "file-routes",
      enforce: "pre",
      config() {
        return {
          optimizeDeps: {
            // These import the virtual module, which only this plugin can
            // resolve; keep them out of esbuild prebundling.
            exclude: options.optimizeDepsExclude ?? ["@solidjs/router/fs"]
          }
        };
      },
      configResolved(config) {
        root = config.root;
        if (!defaultRouter) {
          defaultRouter = new PageFileSystemRouter({
            dir: normalizePath(resolve(config.root, options.dir ?? "src/routes")),
            extensions: options.extensions ?? DEFAULT_EXTENSIONS,
            components: options.components,
            httpMethods: options.httpMethods,
            toPath: options.toPath,
            toRoute: options.toRoute
          });
        }
      },
      async buildStart() {
        await writeTypes();
      },
      async configEnvironment(name, _config, env) {
        if (env.command !== "build" || !buildInputs.includes(name)) return;

        const router = getRouter(name);
        if (!router) return;

        // Every code-split route module is an entry of its own, so the
        // manifest's dynamic imports resolve to real chunks. `$$` refs are
        // inlined into the manifest and need no entry.
        const input: string[] = [];
        for (const route of await router.getRoutes()) {
          for (const [key, ref] of Object.entries(route)) {
            if (ref && key.startsWith("$") && !key.startsWith("$$")) {
              input.push(toModuleId(ref as ModuleRef));
            }
          }
        }
        if (!input.length) return;

        return { build: { rollupOptions: { input } } };
      },
      resolveId(source) {
        if (source === virtualId) return virtualId;
      },
      async load(loadedId) {
        if (loadedId !== virtualId) return;

        const root = this.environment.config.root;
        const isBuild = this.environment.mode === "build";
        const js = jsCode();

        const router = getRouter(this.environment.name);
        const routes = (router ? await router.getRoutes() : []) ?? [];

        const serializeEntry = (entry: unknown) =>
          JSON.stringify(entry, (key, value) => {
            if (value === undefined) return undefined;

            if (key.startsWith("$$")) {
              const buildId = toModuleId(value);

              const refs: Record<string, string> = {};
              for (const pick of value.pick) {
                refs[pick] = js.addNamedImport(pick, buildId);
              }
              return {
                require: `_$() => ({ ${Object.entries(refs)
                  .map(([pick, namedImport]) => `'${pick}': ${namedImport}`)
                  .join(", ")} })$_`
              };
            } else if (key.startsWith("$")) {
              const buildId = toModuleId(value);
              return {
                src: relative(root, buildId),
                build: isBuild ? `_$() => import('${buildId}')$_` : undefined,
                import: `_$() => import('${buildId}')$_`
              };
            }
            return value;
          })
            .replaceAll('"_$(', "(")
            .replaceAll(')$_"', ")");

        // Entries are emitted once and both views reference them, so the
        // nested view costs its own paths and nothing else.
        const bindings = routes.map(
          (route, index) => `const route${index} = ${serializeEntry(route)};`
        );

        const tree = buildRouteTree(
          routes
            .map((route, index) => ({ path: route.path, page: route.page, index }))
            .filter(stub => stub.page)
        );

        const serializeTree = (nodes: RouteTreeEntry[]): string =>
          `[${nodes
            .map(node => {
              const fields = [
                `...route${node.index as number}`,
                `id: ${JSON.stringify(node.id)}`,
                `path: ${JSON.stringify(node.path)}`
              ];
              if (node.children) fields.push(`children: ${serializeTree(node.children)}`);
              return `{ ${fields.join(", ")} }`;
            })
            .join(", ")}]`;

        return `${js.getImportStatements()}
${bindings.join("\n")}
const routes = [${routes.map((_, index) => `route${index}`).join(", ")}];
export default routes;
export const pageRoutes = ${serializeTree(tree)};
`;
      }
    },
    treeShake(),
    fileSystemWatcher(getRouter, virtualId, writeTypes)
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

    // The same export can be reached through more than one ref; reuse the
    // binding instead of importing it twice.
    const existing = names[name];
    if (existing) return existing;

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
