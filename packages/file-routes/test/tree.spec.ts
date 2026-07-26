import { describe, expect, it } from "vitest";

import { buildRouteTree, stripRouteGroups } from "../src/tree.ts";

const entry = (path: string) => ({ path, page: true });

describe("stripRouteGroups", () => {
  it("removes group segments and collapses the slashes they leave", () => {
    expect(stripRouteGroups("/(app)/dashboard")).toBe("/dashboard");
    expect(stripRouteGroups("/(app)")).toBe("/");
    expect(stripRouteGroups("/blog/:id")).toBe("/blog/:id");
  });
});

describe("buildRouteTree", () => {
  it("nests entries under the layout whose path prefixes them", () => {
    const tree = buildRouteTree([
      entry("/(app)/dashboard"),
      entry("/(app)"),
      entry("/(app)/settings"),
      entry("/about")
    ]);

    expect(tree.map(node => node.path).sort()).toEqual(["/", "/about"]);

    const layout = tree.find(node => node.id === "/(app)")!;
    expect(layout.path).toBe("/");
    // shortest path first, and children keep the path relative to their parent
    expect(layout.children?.map(child => child.path)).toEqual(["/settings", "/dashboard"]);
    expect(layout.children?.map(child => child.id)).toEqual(["/settings", "/dashboard"]);
  });

  it("nests to arbitrary depth", () => {
    const tree = buildRouteTree([
      entry("/docs"),
      entry("/docs/api"),
      entry("/docs/api/:name"),
      entry("/docs/guides")
    ]);

    expect(tree).toHaveLength(1);
    const api = tree[0]!.children!.find(child => child.path === "/api")!;
    expect(api.children?.map(child => child.path)).toEqual(["/:name"]);
  });

  it("does not mutate the entries it is given", () => {
    const entries = [entry("/(app)"), entry("/(app)/dashboard")];
    const paths = entries.map(e => e.path);

    buildRouteTree(entries);

    expect(entries.map(e => e.path)).toEqual(paths);
    expect(entries.every(e => !("children" in e))).toBe(true);
  });
});
