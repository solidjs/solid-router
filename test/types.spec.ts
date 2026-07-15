import type { Component, VoidComponent } from "solid-js";
import type { AnchorProps } from "../src/components.jsx";
import { RouteProps } from "../src/routers/components.jsx";
import { useMatch } from "../src/routing.js";
import { MatchFilters, RouteDefinition, RouteSectionProps } from "../src/types.js";
import { createMatcher } from "../src/utils.js";

// mock route type
const Route = <S extends string>(props: RouteProps<S>) => {};

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

  // Matchfilters on a Route are typechecked
  () => {
    const _route = Route({
      path: "/:parent/:birthDate/*extras",
      matchFilters: {
        parent: ["mom", "dad"],
        birthDate: /^\d{4}$/,
        extras: s => s.length > 4
      }
    });

    const _invalid = Route({
      path: "/:unknown",
      matchFilters: {
        // @ts-expect-error 'first' is not a path paramter
        first: /^\d+$/
      }
    });

    // allow disabling typechecks
    const _asAny = Route({
      path: "/:unknown" as any,
      matchFilters: {
        whatever: /^\d+$/
      }
    });

    const _multiple = Route({
      path: ["cars/:id/:plate", "vans/:id"],
      matchFilters: {
        id: /^\d+$/,
        plate: /^\d{2}-\w{3}-\d{2}$/,
        // @ts-expect-error 'something' is not a parameter in either path
        something: s => true
      }
    });

    // cannot typecheck filters ahead of time, so 'any' is assumed
    const matchFilters: MatchFilters = {
      id: /^\d+$/,
      other: s => s.length > 4
    };

    const _usingPredefined = Route({
      path: "/:id",
      matchFilters
    });

    // enable typechecking by specifying variables
    const checkedMatchFilters: MatchFilters<":id"> = {
      id: /^\d+$/,
      // @ts-expect-error 'other' is not a defined paramter
      other: s => s.length > 4
    };

    const _usingPredefinedTypesafe = Route({
      path: "/:product",
      // @ts-expect-error 'id' is not a defined paramter
      checkedMatchFilters
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

    const _route = Route({ path: "/", component: Page });

    const WrongProps = (() => null) as Component<{ foo: string }>;
    const _invalid: RouteDefinition[] = [
      // @ts-expect-error components requiring props the router doesn't pass are rejected
      { path: "/", component: WrongProps }
    ];
  };

  // <A> accepts children like the underlying <a> element (#562)
  () => {
    const _text: AnchorProps = { href: "/", children: "home" };
    const _element: AnchorProps = { href: "/", children: [1, "two"] };
  };
});
