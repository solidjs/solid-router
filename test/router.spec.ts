import {
  createComponent,
  createEffect,
  createRoot,
  createSignal as createSignalBase,
  flush
} from "solid-js";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory, useIsRouting, useNavigate } from "../src/index.js";
import { createRouterContext } from "../src/routing.js";
import type { LocationChange, Navigator, RouteDefinition } from "../src/types.js";
import { createTestRoot, createCounter, waitFor } from "./helpers.js";

const fakeBranches = () => [];
const fakeContext = () => ({});
const createSignal = <T extends LocationChange>(value: T) =>
  createSignalBase<T>(value as Exclude<T, Function>, { ownedWrite: true });

describe("Router should", () => {
  describe("have member `base` which should", () => {
    test(`have a default path when base path is not defined`, () => {
      createRoot(() => {
        const signal = createSignal<LocationChange>({ value: "" });
        const { base } = createRouterContext({ signal }, fakeBranches);
        expect(base.path()).toBe("/");
      });
    });

    test(`have a normalized version of the base path when defined`, () => {
      createRoot(() => {
        const signal = createSignal<LocationChange>({ value: "" });
        const { base } = createRouterContext({ signal }, fakeBranches, fakeContext, {
          base: "base"
        });
        expect(base.path()).toBe("/base");
      });
    });

    test(`throw when the base path is invalid`, () => {
      createRoot(() => {
        const signal = createSignal<LocationChange>({ value: "" });
        expect(() =>
          createRouterContext({ signal }, fakeBranches, fakeContext, { base: "http://example.com" })
        ).toThrow();
      });
    });
  });

  describe("have member `location` which should", () => {
    test(`be initialized by the integration signal`, () => {
      createRoot(() => {
        const signal = createSignal<LocationChange>({
          value: "/foo/bar?hello=world"
        });
        const { location } = createRouterContext({ signal }, fakeBranches);
        expect(location.pathname).toBe("/foo/bar");
        expect(location.search).toBe("?hello=world");
      });
    });

    describe(`contain property 'pathname' which should`, () => {
      test(`be reactive to the path part of the integration signal`, () =>
        createTestRoot(resolve => {
          const expected = "/fizz/buzz";
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.pathname).toBe("/foo/bar");
          signal[1]({ value: expected + "?hello=world" });
          waitFor(() => signal[0]().value === expected + "?hello=world").then(() => {
            expect(location.pathname).toBe(expected);
            resolve();
          });
        }));

      test(`ignore the queryString part of the integration signal`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          const count = createCounter(() => location.pathname);
          expect(location.pathname).toBe("/foo/bar");
          signal[1]({ value: "/foo/bar?fizz=buzz" });
          expect(location.pathname).toBe("/foo/bar");
          expect(count()).toBe(0);
        }));

      test(`handle URL decoding`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo bar+baz"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.pathname).toBe("/foo%20bar+baz");
        }));

      test(`preserve doubled leading slashes instead of parsing as protocol-relative`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "//dash"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.pathname).toBe("//dash");
        }));
    }); // end of "contain property 'pathname'"

    describe(`contain property 'search' which should`, () => {
      test(`be reactive to the search part of the integration signal`, () =>
        createTestRoot(resolve => {
          const expected = "?fizz=buzz";
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);

          expect(location.search).toBe("?hello=world");
          signal[1]({ value: "/foo/baz" + expected });

          waitFor(() => signal[0]().value === "/foo/baz" + expected).then(() => {
            expect(location.search).toBe(expected);
            resolve();
          });
        }));

      test(`ignore the path part of the integration signal`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          const count = createCounter(() => location.search);

          expect(location.search).toBe("?hello=world");
          signal[1]({ value: "/fizz/buzz?hello=world" });
          expect(location.search).toBe("?hello=world");
          expect(count()).toBe(0);
        }));

      test(`handle URL decoding`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo?hello+world=bar+baz"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.search).toBe("?hello+world=bar+baz");
        }));
    }); //end of "contain property 'search'"

    describe(`contain property 'hash' which should`, () => {
      test(`handle URL decoding`, () =>
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo#bar baz"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.hash).toBe("#bar%20baz");
        }));
    }); // end of "contain property 'hash'"

    describe("have member `query` which should", () => {
      test(`be parsed from location.search`, () => {
        createRoot(() => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world&fizz=buzz"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          expect(location.query.hello).toEqual("world");
          expect(location.query.fizz).toEqual("buzz");
        });
      });

      test(`be reactive to location.search`, () =>
        createTestRoot(resolve => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);

          expect(location.query.hello).toEqual("world");
          signal[1]({ value: "/foo/bar?hello=world&fizz=buzz" });

          waitFor(() => signal[0]().value === "/foo/bar?hello=world&fizz=buzz").then(() => {
            expect(location.query.fizz).toEqual("buzz");
            resolve();
          });
        }));

      test(`have fine-grain reactivity`, () =>
        createTestRoot(resolve => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          const count = createCounter(() => location.query.hello);

          expect(location.query.hello).toEqual("world");
          signal[1]({ value: "/foo/bar?hello=world&fizz=buzz" });

          waitFor(() => signal[0]().value === "/foo/bar?hello=world&fizz=buzz").then(() => {
            expect(location.query.fizz).toEqual("buzz");

            expect(count()).toBe(0);

            resolve();
          });
        }));

      test(`have properties which are reactive`, () =>
        createTestRoot(resolve => {
          const signal = createSignal<LocationChange>({
            value: "/foo/bar?hello=world"
          });
          const { location } = createRouterContext({ signal }, fakeBranches);
          const count = createCounter(() => location.query.hello);

          expect(location.query.hello).toEqual("world");
          signal[1]({ value: "/foo/bar?hello=foo" });

          waitFor(() => signal[0]().value === "/foo/bar?hello=foo").then(() => {
            expect(location.search).toEqual("?hello=foo");
            expect(location.query.hello).toEqual("foo");
            expect(count()).toBe(1);
            resolve();
          });
        }));
    }); // end of "have member `query`"
  }); // end "have member `location`"

  describe("have member `navigate` which should", () => {
    test(`update the location in the next microtask`, () => {
      createTestRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(location.pathname).toBe("/");
        navigate("/foo/1");
        setTimeout(() => {
          expect(location.pathname).toBe("/foo/1");
          resolve();
        });
      });
    });

    test(`do nothing if the new path is the same`, () =>
      createTestRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/foo/bar"
        });
        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();
        const count = createCounter(() => location.pathname);

        expect(location.pathname).toBe("/foo/bar");
        navigate("/foo/bar");
        setTimeout(() => {
          expect(location.pathname).toBe("/foo/bar");
          expect(count()).toBe(0);
          resolve();
        });
      }));

    test(`update the integrationSignal`, () =>
      createTestRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();
        expect(signal[0]().value).toBe("/");
        navigate("/foo/bar");

        waitFor(() => signal[0]().value === "/foo/bar").then(n => {
          expect(n).toBe(0);
          expect(signal[0]().replace).not.toBe(true);
          resolve();
        });
      }));

    test(`pass state to location`, () =>
      createTestRoot(resolve => {
        const state = { foo: "bar" };
        const signal = createSignal<LocationChange>({ value: "/" });

        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(location.state).toBeUndefined();
        navigate("/foo", { state });

        waitFor(() => signal[0]().value === "/foo").then(n => {
          expect(n).toBe(0);
          expect(location.state).toEqual(state);
          resolve();
        });
      }));

    test(`allow state replacement without location change`, () =>
      createTestRoot(resolve => {
        const state = { foo: "bar" };
        const signal = createSignal<LocationChange>({ value: "/" });

        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(location.state).toBeUndefined();
        navigate("/", { state });

        waitFor(() => signal[0]().state === state).then(n => {
          expect(n).toBe(0);
          expect(location.state).toEqual(state);
          resolve();
        });
      }));

    test(`be able to be called many times before it updates the integrationSignal`, () =>
      createTestRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(signal[0]()).toEqual({ value: "/" });
        navigate("/foo/1");
        navigate("/foo/2");
        navigate("/foo/3");
        navigate("/foo/4");
        navigate("/foo/5");

        waitFor(() => signal[0]().value === "/foo/5").then(n => {
          expect(n).toBe(0);
          expect(signal[0]().replace).not.toBe(true);
          resolve();
        });
      }));

    test(`not treat a burst of calls in one tick as a redirect chain`, () => {
      // A write is pending from the flush that carries it (solid's A28), not
      // from the call: navigations issued in one synchronous burst supersede
      // each other as separate navigations — none is a redirect of the one
      // before, so the redirect guard has nothing to count.
      createRoot(() => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();
        function pushAlot() {
          for (let i = 0; i < 101; i++) {
            navigate(`/foo/${i}`);
          }
        }
        expect(pushAlot).not.toThrow();
        flush();
        expect(signal[0]()).toMatchObject({ value: "/foo/100", _navigation: 1 });
      });
    });

    test(`throw if a pending navigation is redirected more than 100 times`, () => {
      // The redirect loop the guard exists for: each navigate() runs while
      // the previous one is still held (a parked lazy route section), so each
      // is a hop of that navigation and the depth grows until the guard fires.
      const parked = new Promise<{ default: RouteDefinition[] }>(() => {});
      let navigate!: Navigator;
      const Router = createRouter({
        routes: [
          {
            path: "/",
            component: () => {
              navigate = useNavigate();
              return null;
            }
          },
          {
            path: "/held",
            component: (props: any) => props.children,
            children: () => parked
          }
        ] as const,
        history: memoryHistory("/")
      });
      const dispose = render(() => createComponent(Router, {}), document.body);
      try {
        flush();
        navigate("/held/0");
        flush();
        function redirectALot() {
          for (let i = 1; i <= 100; i++) {
            navigate(`/held/${i}`);
            flush();
          }
        }
        expect(redirectALot).toThrow("Too many redirects");
      } finally {
        document.body.innerHTML = "";
        dispose();
      }
    });
  }); // end of "have member `navigate`"

  describe("have member `isRouting` which should", () => {
    test("be true while the push's transition is held", async () => {
      // A write is pending from the flush that carries it (solid's A28), so
      // `isRouting()` reads true once that flush has run and the navigation
      // is held — here on a parked lazy route section — and false again once
      // the section lands and the location has changed.
      let resolveRoutes!: (routes: { default: RouteDefinition[] }) => void;
      const lazy = new Promise<{ default: RouteDefinition[] }>(r => (resolveRoutes = r));
      let navigate!: Navigator;
      let isRouting!: () => boolean;
      const Router = createRouter({
        routes: [
          {
            path: "/",
            component: () => {
              navigate = useNavigate();
              isRouting = useIsRouting();
              return null;
            }
          },
          {
            path: "/target",
            component: (props: any) => props.children,
            children: () => lazy
          }
        ] as const,
        history: memoryHistory("/")
      });
      const dispose = render(() => createComponent(Router, {}), document.body);
      try {
        flush();
        expect(isRouting()).toBe(false);
        navigate("/target");
        expect(isRouting()).toBe(false); // unflushed: not yet a pending navigation
        flush();
        expect(isRouting()).toBe(true);
        resolveRoutes({ default: [{ path: "/", component: () => null }] });
        await new Promise(r => setTimeout(r, 20));
        expect(isRouting()).toBe(false);
      } finally {
        document.body.innerHTML = "";
        dispose();
      }
    });

    test("turn false, only after location has changed", () =>
      createTestRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory, isRouting } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        navigate("/target");

        //  capture location immediately after `isRouting` turns false
        let postRoutingValue: string | undefined;
        createEffect(
          () => ({
            routing: isRouting(),
            value: signal[0]().value
          }),
          state => {
            if (!state.routing && !postRoutingValue) {
              postRoutingValue = state.value;
            }
          }
        );

        return waitFor(() => !isRouting())
          .then(() => {
            expect(postRoutingValue).toBe("/target");
          })
          .finally(resolve);
      }));
  });
});
