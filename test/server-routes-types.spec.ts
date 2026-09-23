import type { JSX } from "@solidjs/web";
import { createRouter, defineRoute, defineRoutes, serverRouteComponent } from "../src/index.js";
import type { ServerRouteArgs, ServerRouteFunction } from "../src/index.js";

// A `"use server"` reference as seen by the type system: an async function
// resolving to a component. The runtime brand is invisible to types.
declare const storyRoute: (
  args: ServerRouteArgs<{ id: string }>
) => Promise<(props: { children?: JSX.Element }) => JSX.Element>;
declare const leafRoute: (args: ServerRouteArgs<{ id: string }>) => Promise<() => JSX.Element>;
declare const pagedRoute: (
  args: ServerRouteArgs<{}, { page: number }>
) => Promise<() => JSX.Element>;
declare const shellRoute: (
  args: ServerRouteArgs<{}>
) => Promise<
  (props: {
    onSearch: (v: string) => void;
    input: (el: HTMLElement) => void;
    children?: JSX.Element;
  }) => JSX.Element
>;
declare const wrongParams: (args: ServerRouteArgs<{ slug: string }>) => Promise<() => JSX.Element>;

describe("server component route types", () => {
  test("Does not check implementations", () => {});

  // Everything below is type-only: the closure is never invoked.
  () => {
    // A server component whose only client position is `children` is a route...
    defineRoute({ path: "/stories/:id", component: serverRouteComponent(storyRoute) });
    // ...as is one with no client positions at all.
    defineRoute({ path: "/stories/:id", component: serverRouteComponent(leafRoute) });
    defineRoute({ path: "/list", component: serverRouteComponent(pagedRoute) });

    // `children` is the only client position the router fills. A server
    // component that takes others has a client half — that is a client
    // component's job, and the helper says so.
    // @ts-expect-error `onSearch`/`input` are required client positions
    serverRouteComponent(shellRoute);

    // The pattern checks the params the reference declares — through the
    // ordinary `component` slot, no overloads involved.
    // @ts-expect-error `:id` does not guarantee `slug`
    defineRoute({ path: "/stories/:id", component: serverRouteComponent(wrongParams) });

    // Inline client components are untouched.
    defineRoute({ path: "/users/:id", component: props => props.params.id });
    // @ts-expect-error `nope` is not a route prop
    defineRoute({ path: "/users/:id", component: props => props.nope });

    // Both shapes drop into one tree and the factory.
    const routes = defineRoutes([
      defineRoute({ path: "/stories/:id", component: serverRouteComponent(storyRoute) }),
      defineRoute({ path: "/users/:id", component: props => props.params.id })
    ]);
    createRouter({ routes });

    // The public alias is the shape a server module can declare against.
    const _typed: ServerRouteFunction<{ id: string }> = storyRoute;
  };
});
