import { createComputed, createRoot, createSignal } from "solid-js";
import { createRouterContext } from "../src/routing.js";
import type { LocationChange } from "../src/types.js";
import { createAsyncRoot, createCounter, waitFor } from "./helpers.js";

const fakeBranches = () => [];
const fakeContext = () => ({});

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
        createAsyncRoot(resolve => {
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
    }); // end of "contain property 'pathname'"

    describe(`contain property 'search' which should`, () => {
      test(`be reactive to the search part of the integration signal`, () =>
        createAsyncRoot(resolve => {
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
        createAsyncRoot(resolve => {
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
        createAsyncRoot(resolve => {
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
        createAsyncRoot(resolve => {
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
      createAsyncRoot(resolve => {
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
      createAsyncRoot(resolve => {
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
      createAsyncRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();
        expect(signal[0]().value).toBe("/");
        navigate("/foo/bar");

        waitFor(() => signal[0]().value === "/foo/bar").then(n => {
          expect(n).toBe(1);
          expect(signal[0]().replace).not.toBe(true);
          resolve();
        });
      }));

    test(`pass state to location`, () =>
      createAsyncRoot(resolve => {
        const state = { foo: "bar" };
        const signal = createSignal<LocationChange>({ value: "/" });

        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(location.state).toBeUndefined();
        navigate("/foo", { state });

        waitFor(() => signal[0]().value === "/foo").then(n => {
          expect(n).toBe(1);
          expect(location.state).toEqual(state);
          resolve();
        });
      }));

    test(`allow state replacement without location change`, () =>
      createAsyncRoot(resolve => {
        const state = { foo: "bar" };
        const signal = createSignal<LocationChange>({ value: "/" });

        const { location, navigatorFactory } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(location.state).toBeUndefined();
        navigate("/", { state });

        waitFor(() => signal[0]().state === state).then(n => {
          expect(n).toBe(1);
          expect(location.state).toEqual(state);
          resolve();
        });
      }));

    test(`be able to be called many times before it updates the integrationSignal`, () =>
      createAsyncRoot(resolve => {
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
          expect(n).toBe(1);
          expect(signal[0]().replace).not.toBe(true);
          resolve();
        });
      }));

    test(`throw if called more than 100 times during a reactive update`, () => {
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
        expect(pushAlot).toThrow("Too many redirects");
      });
    });
  }); // end of "have member `navigate`"

  describe("have member `isRouting` which should", () => {
    test("be true when the push or replace causes transition", () =>
      createAsyncRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory, isRouting } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        expect(isRouting()).toBe(false);
        navigate("/target");
        expect(isRouting()).toBe(true);
        waitFor(() => !isRouting()).then(resolve);
      }));

    test("turn false, only after location has changed", () =>
      createAsyncRoot(resolve => {
        const signal = createSignal<LocationChange>({
          value: "/"
        });
        const { navigatorFactory, isRouting } = createRouterContext({ signal }, fakeBranches);
        const navigate = navigatorFactory();

        navigate("/target");

        //  capture location immediately after `isRouting` turns false
        let postRoutingValue: string | undefined;
        createComputed(() => {
          if (!isRouting() && !postRoutingValue) {
            postRoutingValue = signal[0]().value;
          }
        });

        return waitFor(() => !isRouting())
          .then(() => {
            expect(postRoutingValue).toBe("/target");
          })
          .finally(resolve);
      }));
  });
});
