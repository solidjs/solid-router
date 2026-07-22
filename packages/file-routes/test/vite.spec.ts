import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { fileRoutes, moduleId } from "../src/vite/index.ts";

const temporaryDirectories: string[] = [];

function createRouteTree(files: Record<string, string>) {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "solid-file-routes-vite-"))
  );
  temporaryDirectories.push(directory);
  for (const [file, source] of Object.entries(files)) {
    const filename = path.join(directory, "src", "routes", file);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true });
  }
});

function loadVirtualModule(root: string, environment = "client") {
  const [plugin] = fileRoutes() as any[];
  plugin.configResolved({ root });
  const context = { environment: { config: { root }, mode: "dev", name: environment } };
  return plugin.load.call(context, moduleId);
}

describe("fileRoutes vite plugin", () => {
  it("serializes the manifest into a virtual module", async () => {
    const root = createRouteTree({
      "index.tsx": "export default () => <h1>Home</h1>;",
      "blog/[id].tsx": `
        export const route = { preload: () => {} };
        export default () => <h1>Post</h1>;
      `
    });

    const code = await loadVirtualModule(root);

    expect(code).toContain("export default [");
    // lazy refs become code-split dynamic imports picking component exports
    expect(code).toMatch(/import\('[^']*index\.tsx\?pick=default&pick=\$css'\)/);
    // eager refs become static imports of the route config
    expect(code).toMatch(/import { route as routeData0 } from '[^']*\[id\]\.tsx\?pick=route';/);
    expect(code).toContain(`"path":"/blog/:id"`);
    expect(code).toContain(`'route': routeData0`);
  });

  it("resolves only the virtual module id", async () => {
    const [plugin] = fileRoutes() as any[];
    expect(plugin.resolveId(moduleId)).toBe(moduleId);
    expect(plugin.resolveId("./other")).toBeUndefined();
  });
});
