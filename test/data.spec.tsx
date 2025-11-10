import {
  ErrorBoundary,
  ParentProps,
  Suspense,
  catchError,
  createRoot,
  createSignal
} from "solid-js";
import { render } from "solid-js/web";
import { createAsync, createAsyncStore } from "../src/data";
import { awaitPromise, waitFor } from "./helpers";

function Parent(props: ParentProps) {
  return <ErrorBoundary fallback={<div id="parentError" />}>{props.children}</ErrorBoundary>;
}

async function getText(arg?: string) {
  return arg || "fallback";
}
async function getError(arg?: any): Promise<any> {
  throw Error("error");
}

describe("createAsync should", () => {
  test("return 'fallback'", () => {
    createRoot(() => {
      const data = createAsync(() => getText());
      setTimeout(() => expect(data()).toBe("fallback"), 1);
    });
  });
  test("return 'text'", () => {
    createRoot(() => {
      const data = createAsync(() => getText("text"));
      setTimeout(() => expect(data()).toBe("text"), 1);
    });
  });
  test("initial error to be caught ", () => {
    createRoot(() => {
      const data = createAsync(() => getError());
      setTimeout(() => catchError(data, err => expect(err).toBeInstanceOf(Error)), 1);
    });
  });
  test("catch error after arg change - initial valid", () =>
    createRoot(async dispose => {
      async function throwWhenError(arg: string): Promise<string> {
        if (arg === "error") throw new Error("error");
        return arg;
      }

      const [arg, setArg] = createSignal("");
      function Child() {
        const data = createAsync(() => throwWhenError(arg()));

        return (
          <div id="child">
            <ErrorBoundary
              fallback={(_, reset) => (
                <div id="childError">
                  <button
                    id="reset"
                    onClick={() => {
                      setArg("true");
                      reset();
                    }}
                  />
                </div>
              )}
            >
              <Suspense>
                <p id="data">{data()}</p>
                <p id="latest">{data.latest}</p>
              </Suspense>
            </ErrorBoundary>
          </div>
        );
      }
      await render(
        () => (
          <Parent>
            <Child />
          </Parent>
        ),
        document.body
      );
      const childErrorElement = () => document.getElementById("childError");
      const parentErrorElement = document.getElementById("parentError");
      expect(childErrorElement()).toBeNull();
      expect(parentErrorElement).toBeNull();
      setArg("error");
      await awaitPromise();

      // after changing the arg the error should still be caught by the Child's ErrorBoundary
      expect(childErrorElement()).not.toBeNull();
      expect(parentErrorElement).toBeNull();

      //reset ErrorBoundary
      document.getElementById("reset")?.click();

      expect(childErrorElement()).toBeNull();
      await awaitPromise();
      const dataEl = () => document.getElementById("data");

      expect(dataEl()).not.toBeNull();
      expect(document.getElementById("data")?.innerHTML).toBe("true");
      expect(document.getElementById("latest")?.innerHTML).toBe("true");

      document.body.innerHTML = "";
      dispose();
    }));
  test("catch consecutive error after initial error change to be caught after arg change", () =>
    createRoot(async cleanup => {
      const [arg, setArg] = createSignal("error");
      function Child() {
        const data = createAsync(() => getError(arg()));

        return (
          <div id="child">
            <ErrorBoundary
              fallback={(_, reset) => (
                <div id="childError">
                  <button id="reset" onClick={() => reset()} />
                </div>
              )}
            >
              <Suspense>{data()}</Suspense>
            </ErrorBoundary>
          </div>
        );
      }
      await render(
        () => (
          <Parent>
            <Child />
          </Parent>
        ),
        document.body
      );

      // Child's ErrorBoundary should catch the error
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();
      setArg("error_2");
      await awaitPromise();
      // after changing the arg the error should still be caught by the Child's ErrorBoundary
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      document.getElementById("reset")?.click();
      await awaitPromise();
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      document.body.innerHTML = "";
      cleanup();
    }));
});
