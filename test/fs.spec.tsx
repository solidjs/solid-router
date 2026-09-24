import { describe, expect, it } from "vitest";

import { defineFileRoute, fileRoutes } from "../src/fs.js";
import { int } from "../src/paths.js";
import type { RoutePaths } from "../src/paths.js";
import { serverRouteOf } from "../src/serverRouteShared.js";
import type {
  RouteComponent,
  RouteProps,
  ServerRouteArgs,
  StandardSchemaV1
} from "../src/types.js";

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

  it("passes eagerly delivered components through un-lazied", () => {
    // a manifest delivered with `codeSplitting: false` materializes
    // `$component` as an eager ref: statically imported, `require`-shaped
    const eager = [
      {
        path: "/",
        page: true,
        $component: { src: "/routes/index.tsx", require: () => ({ default: Home }) },
        $$route: undefined,
        children: undefined
      }
    ] as const;

    const routes = fileRoutes(eager);

    // the component is the module's own export — no lazy wrapper, so no
    // moduleUrl/preload machinery and no suspense on first render
    expect(routes[0].component).toBe(Home);
    expect((routes[0].component as any).preload).toBeUndefined();
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

/*
 * Server pages. With `fileRoutes({ serverComponents: true })` the plugin
 * flags a route whose default export opens with `"use server"` as
 * `server: true` and delivers its stub eagerly; the adapter turns that into
 * a server component route keyed by the file. In these specs the flag module
 * is the shipped one (`serverRoutes: true`, aliased in vitest.config.ts).
 */
const SERVER_FUNCTION_METADATA = Symbol.for("solid.ServerFunctionMetadata");
/** Brand `fn` the way compiled `"use server"` output does. */
function serverFunction<F extends (...args: any[]) => any>(fn: F): F {
  (fn as any)[SERVER_FUNCTION_METADATA] = {};
  return fn;
}

const pageSchema: StandardSchemaV1<{ page?: string }, { page: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: any) => ({ value: { page: Number(value?.page) || 1 } })
  }
};

describe("fileRoutes server pages", () => {
  const Story = serverFunction(async (_args: ServerRouteArgs) => () => "story" as any);
  const Feed = serverFunction(async (_args: ServerRouteArgs) => () => "feed" as any);
  const feedRoute = defineFileRoute("/feed", { search: pageSchema, live: true });

  const entries = [
    {
      path: "/stories/:id",
      page: true,
      server: true,
      // a stub is what a client bundle holds for the function; the pick
      // query on the src is the plugin's, the key must not carry it
      $component: {
        src: "/src/routes/stories/[id].tsx?pick=default",
        require: () => ({ default: Story })
      },
      $$route: undefined,
      children: undefined
    },
    {
      path: "/feed",
      page: true,
      server: true,
      $component: { src: "/src/routes/feed.tsx", require: () => ({ default: Feed }) },
      $$route: { require: () => ({ route: feedRoute }) },
      children: undefined
    }
  ] as const;

  it("wraps a server-function page as a server component route keyed by its file", () => {
    const routes = fileRoutes(entries);
    const brand = serverRouteOf(routes[0].component)!;
    expect(brand).toBeDefined();
    // the injected `query`: the source is the stub, the key its file path
    const call = brand.call as any;
    expect(call.key).toBe("/src/routes/stories/[id].tsx");
    expect(call.keyFor({ params: { id: "7" }, search: undefined })).toContain(
      "/src/routes/stories/[id].tsx"
    );
    // a directory prefix reaches every page beneath it — `revalidate("/src/routes/stories")`
    expect(call.key.startsWith("/src/routes/stories")).toBe(true);
    // not a `liveQuery`
    expect(call.status).toBeUndefined();
  });

  it("sources through liveQuery when the route says live", () => {
    const routes = fileRoutes(entries);
    const call = serverRouteOf(routes[1].component)!.call as any;
    expect(call.key).toBe("/src/routes/feed.tsx");
    expect(typeof call.status).toBe("function");
    // the config is still spread into the definition (search drives the call's args)
    expect(routes[1].search).toBe(pageSchema);
  });

  it("leaves an eager client page alone", () => {
    const Home = () => "home" as any;
    const routes = fileRoutes([
      {
        path: "/",
        page: true,
        $component: { src: "/routes/index.tsx", require: () => ({ default: Home }) },
        $$route: undefined,
        children: undefined
      }
    ] as const);
    expect(routes[0].component).toBe(Home);
    expect(serverRouteOf(routes[0].component)).toBeUndefined();
  });

  it("rejects a code-split server function with a directed error", async () => {
    // the scanner missed the directive (wrapper call, re-export) or ran
    // without `serverComponents`: the page was code-split like a client page
    const routes = fileRoutes([
      {
        path: "/late",
        page: true,
        $component: { src: "/routes/late.tsx", import: async () => ({ default: Story }) },
        $$route: undefined,
        children: undefined
      }
    ] as const);
    await expect((routes[0].component as any).preload()).rejects.toThrow(
      /"\/routes\/late.tsx" exports a server function as its page.*serverComponents: true/s
    );
  });

  it("types ServerRouteArgs from the route witness", () => {
    // compile-time assertions only — `test:types` enforces them
    () => {
      const storyRoute = defineFileRoute("/stories/:id/:tab?", { search: pageSchema });
      const _Story = async ({ params, search }: ServerRouteArgs<typeof storyRoute>) => {
        const _id: string = params.id;
        // @ts-expect-error optional params may be undefined
        const _tab: string = params.tab;
        // search is the schema's output
        const _page: number = search.page;
        // @ts-expect-error not in the schema output
        search.missing;
        return () => null;
      };

      // no schema: search is undefined
      const bare = defineFileRoute("/about", {});
      const _About = async ({ search }: ServerRouteArgs<typeof bare>) => {
        const _s: undefined = search;
        return () => null;
      };

      // the plain form still reads as before
      const _Plain = async ({ params, search }: ServerRouteArgs<{ id: string }, { q: string }>) => {
        const _id: string = params.id;
        const _q: string = search.q;
        return () => null;
      };
    };
  });
});
