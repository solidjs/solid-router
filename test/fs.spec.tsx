import { describe, expect, it } from "vitest";

import { fileRoutes } from "../src/fs.js";
import { int } from "../src/paths.js";
import type { RoutePaths } from "../src/paths.js";

/*
 * The entries mirror what `file-routes` serves from its virtual module
 * (nested `pageRoutes` view), with the literal types its generated
 * declaration gives them — the `const` type parameter on `fileRoutes` is
 * what keeps them literal on the way through.
 */
const Home = () => "home" as any;
const Blog = (props: { children?: any }) => props.children;
const Post = () => "post" as any;

const postRoute = {
  matchFilters: { id: int },
  info: { section: "blog" }
};

const entries = [
  {
    path: "/",
    page: true,
    $component: { src: "/routes/index.tsx", import: async () => ({ default: Home }) },
    $$route: undefined,
    children: undefined
  },
  {
    path: "/blog",
    page: true,
    $component: { src: "/routes/blog.tsx", import: async () => ({ default: Blog }) },
    $$route: undefined,
    children: [
      {
        path: "/:id",
        page: true,
        $component: { src: "/routes/blog/[id].tsx", import: async () => ({ default: Post }) },
        $$route: { require: () => ({ route: postRoute }) },
        children: undefined
      }
    ]
  },
  {
    path: "/docs/*path",
    page: true,
    // shares the blog module on purpose, to observe component caching
    $component: { src: "/routes/blog.tsx", import: async () => ({ default: Blog }) },
    $$route: undefined,
    children: undefined
  }
] as const;

describe("fileRoutes", () => {
  it("maps manifest entries to route definitions", () => {
    const routes = fileRoutes(entries);

    expect(routes.map(route => route.path)).toEqual(["/", "/blog", "/docs/*path"]);
    expect(routes[1].children![0].path).toBe("/:id");

    // the `route` config export is spread into the definition
    const post = routes[1].children![0];
    expect(post.matchFilters).toEqual({ id: int });
    expect(post.info).toEqual({ section: "blog", filesystem: true });

    // `$component` refs become lazy components carrying their moduleUrl
    expect(typeof routes[0].component).toBe("function");
    expect((routes[0].component as any).moduleUrl).toBe("/routes/index.tsx");
    expect(typeof (routes[0].component as any).preload).toBe("function");
  });

  it("reuses one lazy component per module src", () => {
    const routes = fileRoutes(entries);
    expect(routes[1].component).toBe(routes[2].component);
  });

  it("preserves the tuple for typed paths", () => {
    const routes = fileRoutes(entries);

    // compile-time assertions only — `test:types` enforces them
    const _typedPaths = (paths: RoutePaths<typeof routes>) => {
      const root: string = paths();
      const layout: string = paths.blog();
      // the int match filter from the `route` export types the param
      const post: string = paths.blog(42)();
      const doc: string = paths.docs("guides/install")();

      // @ts-expect-error - no such route
      paths.missing;
      // @ts-expect-error - the int match filter rejects a string id
      paths.blog("not-a-number");

      return [root, layout, post, doc];
    };

    // the tuple survived if the length is literal, not `number`
    const length: 3 = routes.length;
    expect(length).toBe(3);
  });
});
