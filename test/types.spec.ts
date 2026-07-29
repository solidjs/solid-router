import type { Component, VoidComponent } from "solid-js";
import { defineRoute } from "../src/routers/factory.jsx";
import { useMatch } from "../src/routing.js";
import {
  MatchFilters,
  RouteComponent,
  RouteDefinition,
  RouteParams,
  RouteProps,
  RouteSectionProps
} from "../src/types.js";
import { createMatcher } from "../src/utils.js";

describe("Type checking on various route definitions", () => {
  test("Does not check implementations", () => {});

  // Matchfilters on createMatcher are typechecked
  () => {
    const _matcher = createMatcher("/:parent/:birthDate/*extras", undefined, {
      parent: ["mom", "dad"],
      birthDate: /^\d{4}$/,
      extras: s => s.length > 4
    });

    const _invalid = createMatcher("/:unknown", undefined, {
      // @ts-expect-error 'first' is not a path paramter
      first: /^\d+$/
    });

    // allow disabling typechecks
    const _asAny = createMatcher("/:unknown" as any, undefined, {
      whatever: /^\d+$/
    });
  };

  // Matchfilters on useMatch are typechecked
  () => {
    const _match = useMatch(() => "/:parent/:birthDate/*extras", {
      parent: ["mom", "dad"],
      birthDate: /^\d{4}$/,
      extras: s => s.length > 4
    });

    const _invalid = useMatch(() => "/:unknown", {
      // @ts-expect-error 'first' is not a path paramter
      first: /^\d+$/
    });

    // allow disabling typechecks
    const _asAny = useMatch("/:unknown" as any, {
      whatever: /^\d+$/
    });
  };

  // Matchfilters on a route definition are typechecked
  () => {
    const _route = defineRoute({
      path: "/:parent/:birthDate/*extras",
      matchFilters: {
        parent: ["mom", "dad"],
        birthDate: /^\d{4}$/,
        extras: s => s.length > 4
      }
    });

    // @ts-expect-error 'first' is not a path paramter
    const _invalid = defineRoute({
      path: "/:unknown",
      matchFilters: {
        first: /^\d+$/
      }
    });

    // allow disabling typechecks
    const _asAny = defineRoute({
      path: "/:unknown" as any,
      matchFilters: {
        whatever: /^\d+$/
      }
    });

    // @ts-expect-error 'something' is not a parameter in either path
    const _multiple = defineRoute({
      path: ["cars/:id/:plate", "vans/:id"],
      matchFilters: {
        id: /^\d+$/,
        plate: /^\d{2}-\w{3}-\d{2}$/,
        something: (s: string) => true
      }
    });

    // cannot typecheck filters ahead of time, so 'any' is assumed
    const matchFilters: MatchFilters = {
      id: /^\d+$/,
      other: s => s.length > 4
    };

    const _usingPredefined = defineRoute({
      path: "/:id",
      matchFilters
    });

    // enable typechecking by specifying variables
    const checkedMatchFilters: MatchFilters<":id"> = {
      id: /^\d+$/,
      // @ts-expect-error 'other' is not a defined paramter
      other: s => s.length > 4
    };

    // @ts-expect-error 'id' is not a parameter of '/:product'
    const _usingPredefinedTypesafe = defineRoute({
      path: "/:product",
      matchFilters: checkedMatchFilters
    });
  };

  // Typed components/preloads are assignable in annotated configs (#454)
  () => {
    const TypedComponent = (() => null) as Component<RouteSectionProps<{ x: string; y: string }>>;
    const loadFunc = () => ({ x: "x", y: "y" });

    const _routes: RouteDefinition[] = [
      {
        path: "/",
        component: TypedComponent,
        preload: loadFunc
      }
    ];

    const _explicit: RouteDefinition<"/", { x: string; y: string }> = {
      path: "/",
      component: TypedComponent,
      preload: loadFunc
    };
  };

  // VoidComponent pages are accepted as route components (#347)
  () => {
    const Page = (() => null) as VoidComponent;
    const TypedPage = (() => null) as VoidComponent<{ data: number }>;

    const _routes: RouteDefinition[] = [
      { path: "/", component: Page },
      { path: "/typed", component: TypedPage, preload: () => 1 }
    ];

    const _route = defineRoute({ path: "/", component: Page });

    const WrongProps = (() => null) as Component<{ foo: string }>;
    const _invalid: RouteDefinition[] = [
      // @ts-expect-error components requiring props the router doesn't pass are rejected
      { path: "/", component: WrongProps }
    ];
  };

  // defineRoute types params from the route's own pattern
  () => {
    const _story = defineRoute({
      path: "/stories/:id",
      component: props => {
        const _id: string = props.params.id;
        // @ts-expect-error params not in the pattern are only `string | undefined`
        const _other: string = props.params.other;
        return props.params.id;
      },
      preload: ({ params }) => {
        const _id: string = params.id;
        // @ts-expect-error params not in the pattern are only `string | undefined`
        const _other: string = params.other;
        return params.id;
      }
    });

    const _optionalAndSplat = defineRoute({
      path: "/users/:id/:tab?/*rest",
      component: props => {
        const _id: string = props.params.id;
        const _rest: string = props.params.rest;
        // @ts-expect-error optional params may be undefined
        const _tab: string = props.params.tab;
        return null;
      }
    });

    // preload data flows into the component's `props.data`
    const _typedData = defineRoute({
      path: "/stories/:id",
      preload: ({ params }) => ({ story: params.id }),
      component: props => {
        const _story: string = props.data.story;
        return null;
      }
    });

    // pathless (layout) routes keep the open Params record
    const _layout = defineRoute({
      component: props => {
        const _anything: string | undefined = props.params.anything;
        return null;
      }
    });

    // array patterns type the union of their members' params
    const _multi = defineRoute({
      path: ["cars/:id/:plate", "vans/:id"],
      component: props => {
        const _id: string = props.params.id;
        return null;
      }
    });

    // defineRoute results are plain RouteDefinitions
    const _routes: RouteDefinition[] = [
      defineRoute({
        path: "/stories/:id",
        component: props => props.params.id
      }),
      { path: "/plain" }
    ];

    // RouteParams is usable standalone for annotating extracted components
    const Standalone = (props: RouteSectionProps<unknown, RouteParams<"/stories/:id">>) =>
      props.params.id;
    const _standalone = defineRoute({ path: "/stories/:id", component: Standalone });

    // RouteProps puts the path witness first — pattern-string form
    const StoryFromPattern = (props: RouteProps<"/stories/:id/:tab?", { n: number }>) => {
      const _id: string = props.params.id;
      const _n: number = props.data.n;
      // @ts-expect-error optional param may be undefined
      const _tab: string = props.params.tab;
      // params not in the pattern stay `string | undefined`
      const _inherited: string | undefined = props.params.other;
      return null;
    };
    const _fromPattern = defineRoute({
      path: "/stories/:id/:tab?",
      preload: () => ({ n: 1 }),
      component: StoryFromPattern
    });

    // RouteComponent is the component-type form — props infer contextually
    const StoryComponent: RouteComponent<"/stories/:id", { n: number }> = props => {
      const _id: string = props.params.id;
      const _n: number = props.data.n;
      return null;
    };
    const _asComponent = defineRoute({
      path: "/stories/:id",
      preload: () => ({ n: 1 }),
      component: StoryComponent
    });
  };
});
