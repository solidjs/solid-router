import type { EnvironmentModuleNode, FSWatcher, PluginOption, ViteDevServer } from "vite";

import type { BaseFileSystemRouter } from "../router.ts";
import { debounce } from "./debounce.ts";

function setupWatcher(watcher: FSWatcher, routes: BaseFileSystemRouter): void {
  watcher.on("unlink", path => routes.removeRoute(path));
  watcher.on("add", path => routes.addRoute(path));
  watcher.on("change", path => routes.updateRoute(path));
}

function createRoutesReloader(
  server: ViteDevServer,
  routes: BaseFileSystemRouter,
  environment: string,
  moduleId: string,
  onReload?: () => void | Promise<void>
) {
  const devEnv = server.environments[environment];
  if (!devEnv?.moduleGraph) return;

  /**
   * Debounce catches multiple route changes in a row
   * Short timeout for inexpensive invalidations
   */
  const invalidateModule = debounce((mod: EnvironmentModuleNode) => {
    devEnv.moduleGraph.invalidateModule(mod);
  }, 0);

  /**
   * Long debounce timeout for expensive reloads
   */
  const reloadModule = debounce((mod: EnvironmentModuleNode) => {
    devEnv.reloadModule(mod);
  }, 200);

  return routes.on("reload", function handleRoutesReload(evt): void {
    void onReload?.();

    const mod = devEnv.moduleGraph.getModuleById(moduleId)!;
    if (!mod) {
      devEnv.hot.send({ type: "full-reload" });
      return;
    }

    if (evt.detail.type !== "update") {
      // Adding or removing a route changes the manifest itself, and marking
      // it invalid is not enough to replace it: whoever evaluated the module
      // holds their own copy — the browser, or a server-side module runner
      // like the one nitro serves SSR from — and only a reload displaces it.
      // An `update` needs no reload: the entries are unchanged, and the route
      // module's own HMR covers its contents.
      reloadModule(mod);
    } else {
      invalidateModule(mod);
    }
  });
}

export const fileSystemWatcher = (
  getRouter: (environment: string) => BaseFileSystemRouter | undefined,
  moduleId: string,
  /** Runs on every route change, before the module is invalidated. */
  onReload?: () => void | Promise<void>
): PluginOption => {
  const plugin: PluginOption = {
    name: "file-routes:watcher",
    async configureServer(server: ViteDevServer) {
      const watched = new Set<BaseFileSystemRouter>();
      for (const environment of Object.keys(server.environments)) {
        const router = getRouter(environment);
        if (!router) continue;
        if (!watched.has(router)) {
          watched.add(router);
          setupWatcher(server.watcher, router);
        }
        // Build the manifest before listening for reloads, so the initial
        // scan's `add` events don't invalidate the module mid-page-load.
        router
          .getRoutes()
          .then(() => createRoutesReloader(server, router, environment, moduleId, onReload));
      }
    }
  };
  return plugin;
};
