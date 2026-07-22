import { describe, expect, it } from "vitest";

import { createFileRoutes, FileRoutes, type FileRouteEntry } from "../src/fs.js";
import type { RouteDefinition } from "../src/types.js";

const page = (src: string): FileRouteEntry["$component"] => ({
  src,
  import: async () => ({ default: () => null })
});

describe("createFileRoutes", () => {
  it("emits lazy RouteDefinitions marked as filesystem routes", () => {
    const routes = createFileRoutes([
      { path: "/", page: true, $component: page("routes/index.tsx") }
    ]);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/");
    expect(typeof routes[0].component).toBe("function");
    expect(routes[0].info).toEqual({ filesystem: true });
  });

  it("skips non-page entries", () => {
    const routes = createFileRoutes([
      { path: "/api/data", page: false },
      { path: "/", page: true, $component: page("routes/index.tsx") }
    ]);

    expect(routes.map(r => r.path)).toEqual(["/"]);
  });

  it("nests child routes under their parent by path prefix", () => {
    const routes = createFileRoutes([
      { path: "/blog", page: true, $component: page("routes/blog.tsx") },
      { path: "/blog/:id", page: true, $component: page("routes/blog/[id].tsx") }
    ]);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/blog");
    const children = routes[0].children as RouteDefinition[];
    expect(children).toHaveLength(1);
    expect(children[0].path).toBe("/:id");
  });

  it("strips (group) segments from paths while nesting inside them", () => {
    const routes = createFileRoutes([
      { path: "/(marketing)", page: true, $component: page("routes/(marketing).tsx") },
      { path: "/(marketing)/about", page: true, $component: page("routes/(marketing)/about.tsx") }
    ]);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/");
    const children = routes[0].children as RouteDefinition[];
    expect(children[0].path).toBe("/about");
  });

  it("merges the route config export into the definition", () => {
    const preload = () => {};
    const routes = createFileRoutes([
      {
        path: "/",
        page: true,
        $component: page("routes/index.tsx"),
        $$route: { require: () => ({ route: { preload, info: { title: "Home" } } }) }
      }
    ]);

    expect(routes[0].preload).toBe(preload);
    expect(routes[0].info).toEqual({ title: "Home", filesystem: true });
  });

  it("reuses one lazy component per source module", () => {
    const shared = page("routes/shared.tsx");
    const [a] = createFileRoutes([{ path: "/a", page: true, $component: shared }]);
    const [b] = createFileRoutes([{ path: "/b", page: true, $component: shared }]);

    expect(a.component).toBe(b.component);
  });
});

describe("FileRoutes", () => {
  it("renders the manifest served by the delivery adapter", () => {
    const routes = FileRoutes() as unknown as RouteDefinition[];

    expect(routes.map(r => r.path)).toEqual(["/", "/about"]);
    expect(routes.every(r => (r.info as any).filesystem)).toBe(true);
    // memoized across renders
    expect(FileRoutes()).toBe(routes as unknown as ReturnType<typeof FileRoutes>);
  });
});
