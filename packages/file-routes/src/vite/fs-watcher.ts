import type { EnvironmentModuleNode, FSWatcher, PluginOption, ViteDevServer } from "vite";

import type { BaseFileSystemRouter } from "../router.ts";
import { moduleId } from "./constants.ts";
import { debounce } from "./debounce.ts";

function setupWatcher(watcher: FSWatcher, routes: BaseFileSystemRouter): void {
  watcher.on("unlink", path => routes.removeRoute(path));
  watcher.on("add", path => routes.addRoute(path));
  watcher.on("change", path => routes.updateRoute(path));
}

function createRoutesReloader(
  server: ViteDevServer,
  routes: BaseFileSystemRouter,
  environment: string
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
    const mod = devEnv.moduleGraph.getModuleById(moduleId)!;
    if (!mod) {
      devEnv.hot.send({ type: "full-reload" });
      return;
    }

    if (environment === "client" && evt.detail.type !== "update") {
      // Client has to be reloaded when routes are added or removed
      reloadModule(mod);
    } else {
      invalidateModule(mod);
    }
  });
}

export const fileSystemWatcher = (
  getRouter: (environment: string) => BaseFileSystemRouter | undefined
): PluginOption => {
  const plugin: PluginOption = {
    name: "solid-file-routes:watcher",
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
        router.getRoutes().then(() => createRoutesReloader(server, router, environment));
      }
    }
  };
  return plugin;
};
