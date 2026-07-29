import { describe, expect, it } from "vitest";

import { defineFileRoute, fileRoutes } from "../src/fs.js";
import { int } from "../src/paths.js";
import type { RoutePaths } from "../src/paths.js";
import type { RouteComponent, RouteProps } from "../src/types.js";

/*
 * The entries mirror what `file-routes` serves from its virtual module
 * (nested `pageRoutes` view), with the literal types its generated
 * declaration gives them — the `const` type parameter on `fileRoutes` is
 * what keeps them literal on the way through.
 */
const Home = () => "home" as any;
const Blog = (props: { children?: any }) => props.children;
const Post = () => "post" as any;

const postRoute = defineFileRoute("/blog/:id", {
  matchFilters: { id: int },
  info: { section: "blog" },
  preload: ({ params }) => params.id
});

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

  it("types the route export from its pattern witness", () => {
    // runtime: identity — the config is spread into the definition untouched
    const routes = fileRoutes(entries);
    const post = routes[1].children![0];
    expect(post.matchFilters).toEqual({ id: int });
    expect(typeof post.preload).toBe("function");

    // compile-time assertions only — `test:types` enforces them
    () => {
      defineFileRoute("/blog/:id/:tab?", {
        preload: ({ params }) => {
          const _id: string = params.id;
          // @ts-expect-error optional params may be undefined
          const _tab: string = params.tab;
          // params not in the pattern stay `string | undefined`
          const _other: string | undefined = params.other;
          return params.id;
        }
      });

      // @ts-expect-error 'wrong' is not a param of the pattern
      defineFileRoute("/blog/:id", { matchFilters: { wrong: /^\d+$/ } });

      // the config doubles as the component's witness: params from the
      // pattern brand, data inferred from the preload's return type
      const _Post = (props: RouteProps<typeof postRoute>) => {
        const _id: string = props.params.id;
        const _data: string = props.data; // preload returns params.id
        // @ts-expect-error data is the preload's return type, not a number
        const _wrong: number = props.data;
        return null;
      };

      // an explicit second argument still overrides the inferred data type
      const _Cast = (props: RouteProps<typeof postRoute, { n: number }>) => props.data.n;

      // the component-type form infers `props` contextually
      const _PostComponent: RouteComponent<typeof postRoute> = props => {
        const _id: string = props.params.id;
        const _data: string = props.data;
        return null;
      };
    };
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
