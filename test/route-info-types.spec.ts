import { defineRoute, useRouteMatches } from "../src/index.js";

/*
 * `RouteInfo` is declared in the package entry precisely so this augmentation
 * merges — the same declaration an app would write against
 * "@solidjs/router". Note the merge applies to this whole test project.
 */
declare module "../src/index.js" {
  interface RouteInfo {
    breadcrumb?: string;
  }
}

describe("RouteInfo augmentation", () => {
  test("Does not check implementations", () => {});

  // Everything below is type-only: the closure is never invoked.
  () => {
    // declared keys are checked at the definition...
    defineRoute({ path: "/", info: { breadcrumb: "Home" } });
    // @ts-expect-error breadcrumb was augmented as a string
    defineRoute({ path: "/", info: { breadcrumb: 5 } });

    // ...and typed on reads
    const matches = useRouteMatches();
    const crumb = matches()[0].route.info?.breadcrumb;
    const _typed: string | undefined = crumb;
    // @ts-expect-error breadcrumb is a string, not a number
    const _wrong: number = crumb;

    // undeclared keys stay freeform
    defineRoute({ path: "/", info: { anything: { goes: true } } });
  };
});
