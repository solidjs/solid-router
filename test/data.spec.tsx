import { Errored, ParentProps, Loading, createRoot, createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { createAsync, createAsyncStore } from "../src/data";
import { awaitPromise, waitFor } from "./helpers";

function Parent(props: ParentProps) {
  return <Errored fallback={<div id="parentError" />}>{props.children}</Errored>;
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
      setTimeout(() => {
        try {
          data();
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }, 1);
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
            <Errored
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
              <Loading>
                <p id="data">{data()}</p>
              </Loading>
            </Errored>
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

      // In Solid 2.0, reset is async — wait for the boundary to clear and the new value to resolve
      await awaitPromise();
      expect(childErrorElement()).toBeNull();
      const dataEl = () => document.getElementById("data");

      expect(dataEl()).not.toBeNull();
      expect(document.getElementById("data")?.innerHTML).toBe("true");

      document.body.innerHTML = "";
      dispose();
    }));
  test("catch error again after reset when source still errors", () =>
    createRoot(async cleanup => {
      const [arg, setArg] = createSignal("error");
      function Child() {
        const data = createAsync(() => getError(arg()));

        return (
          <div id="child">
            <Errored
              fallback={(_, reset) => (
                <div id="childError">
                  <button id="reset" onClick={() => reset()} />
                </div>
              )}
            >
              <Loading>{data()}</Loading>
            </Errored>
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

      // In Solid 2.0, async error needs a tick to propagate
      await awaitPromise();

      // Child's Errored boundary should catch the initial error
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      // Reset while source still errors — should re-catch
      document.getElementById("reset")?.click();
      await awaitPromise();
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      document.body.innerHTML = "";
      cleanup();
    }));
});
