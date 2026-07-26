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

function createPlugin(root: string, options: Parameters<typeof fileRoutes>[0] = {}) {
  const [plugin] = fileRoutes(options) as any[];
  plugin.configResolved({ root });
  return plugin;
}

function loadVirtualModule(root: string, environment = "client") {
  const plugin = createPlugin(root);
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

    expect(code).toContain("export default routes;");
    // lazy refs become code-split dynamic imports picking component exports
    expect(code).toMatch(/import\('[^']*index\.tsx\?pick=default&pick=\$css'\)/);
    // eager refs become static imports of the route config
    expect(code).toMatch(/import { route as routeData0 } from '[^']*\[id\]\.tsx\?pick=route';/);
    expect(code).toContain(`"path":"/blog/:id"`);
    expect(code).toContain(`'route': routeData0`);
  });

  it("serves a nested, group-stripped view alongside the flat manifest", async () => {
    const root = createRouteTree({
      "(app).tsx": "export default props => <main>{props.children}</main>;",
      "(app)/dashboard.tsx": "export default () => <h1>Dashboard</h1>;",
      "api/health.ts": "export const GET = () => new Response('ok');"
    });

    const code = await loadVirtualModule(root);

    // the layout keeps its group segment in the flat view...
    expect(code).toContain(`"path":"/(app)"`);
    // ...and loses it in the nested one, where the child is relative to it
    expect(code).toMatch(
      /export const pageRoutes = \[\{ \.\.\.route\d, id: "\/\(app\)", path: "\/", children: \[\{ \.\.\.route\d, id: "\/dashboard", path: "\/dashboard" \}\] \}\]/
    );
    // entries are referenced, not copied, so refs are emitted exactly once
    expect(code.match(/pick=default&pick=\$css'\)/g)?.length).toBe(2);
  });

  it("resolves only the virtual module id", async () => {
    const [plugin] = fileRoutes() as any[];
    expect(moduleId).toBe("virtual:file-routes");
    expect(plugin.resolveId(moduleId)).toBe(moduleId);
    expect(plugin.resolveId("./other")).toBeUndefined();
  });

  it("serves the manifest from a custom module id", async () => {
    const [plugin] = fileRoutes({ moduleId: "virtual:routes" }) as any[];
    expect(plugin.resolveId("virtual:routes")).toBe("virtual:routes");
    expect(plugin.resolveId(moduleId)).toBeUndefined();
  });

  it("lets consumers replace the prebundling exclusion", () => {
    const [defaults] = fileRoutes() as any[];
    expect(defaults.config().optimizeDeps.exclude).toEqual(["@solidjs/router/fs"]);

    const [custom] = fileRoutes({ optimizeDepsExclude: [] }) as any[];
    expect(custom.config().optimizeDeps.exclude).toEqual([]);
  });

  describe("types", () => {
    it("declares the manifest as a literal tuple", async () => {
      const root = createRouteTree({
        "(app).tsx": "export default props => <main>{props.children}</main>;",
        "(app)/blog/[id].tsx": `
          export const route = { preload: () => {} };
          export default () => <h1>Post</h1>;
        `,
        "api/health.ts": "export const GET = () => new Response('ok');"
      });
      const plugin = createPlugin(root, { types: "generated.d.ts", httpMethods: true });

      await plugin.buildStart.call({});
      const declaration = fs.readFileSync(path.join(root, "generated.d.ts"), "utf-8");

      expect(declaration).toContain('declare module "virtual:file-routes"');
      // a tuple, not an array — path-derived types degrade to `any` on arrays
      expect(declaration).toMatch(/const routes: readonly \[/);
      expect(declaration).toMatch(/export const pageRoutes: readonly \[/);
      // literal paths, nested exactly as the runtime view nests them
      expect(declaration).toContain('path: "/(app)"');
      expect(declaration).toContain('path: "/blog/:id"');
      expect(declaration).toMatch(/children: readonly \[[\s\S]*path: "\/blog\/:id"/);
      // absent refs stay readable rather than vanishing from the type
      expect(declaration).toContain("$$route?: undefined");
      // handler refs are typed too, and a handler-only module is not a page
      expect(declaration).toContain("$GET: FileRouteLazyRef");
      expect(declaration).toMatch(/path: "\/api\/health";\s*\n\s*page: false/);
    });

    it("rewrites the declaration only when the routes change", async () => {
      const root = createRouteTree({ "index.tsx": "export default () => <h1>Home</h1>;" });
      const plugin = createPlugin(root, { types: "generated.d.ts" });

      await plugin.buildStart.call({});
      const first = fs.statSync(path.join(root, "generated.d.ts")).mtimeMs;

      await plugin.buildStart.call({});
      expect(fs.statSync(path.join(root, "generated.d.ts")).mtimeMs).toBe(first);
    });

    it("writes nothing unless asked", async () => {
      const root = createRouteTree({ "index.tsx": "export default () => <h1>Home</h1>;" });
      const plugin = createPlugin(root);

      await plugin.buildStart.call({});

      expect(fs.existsSync(path.join(root, "file-routes.d.ts"))).toBe(false);
    });
  });

  describe("buildInputs", () => {
    const root = () =>
      createRouteTree({
        "index.tsx": "export default () => <h1>Home</h1>;",
        "blog/[id].tsx": `
          export const route = { preload: () => {} };
          export default () => <h1>Post</h1>;
        `
      });

    it("takes every code-split route module as a build entry", async () => {
      const plugin = createPlugin(root(), { buildInputs: "client" });

      const config = await plugin.configEnvironment("client", {}, { command: "build" });
      const input: string[] = config.build.rollupOptions.input;

      expect(input).toHaveLength(2);
      expect(input.every(id => id.includes("?pick=default&pick=$css"))).toBe(true);
      // `$$route` refs are inlined into the manifest, so they are not entries
      expect(input.some(id => id.endsWith("?pick=route"))).toBe(false);
    });

    it("only contributes inputs to the named environments, on build", async () => {
      const directory = root();
      const plugin = createPlugin(directory, { buildInputs: "client" });

      expect(await plugin.configEnvironment("ssr", {}, { command: "build" })).toBeUndefined();
      expect(await plugin.configEnvironment("client", {}, { command: "serve" })).toBeUndefined();

      const off = createPlugin(directory);
      expect(await off.configEnvironment("client", {}, { command: "build" })).toBeUndefined();
    });
  });
});
