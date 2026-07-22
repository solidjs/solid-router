import {
  ErrorBoundary,
  ParentProps,
  Suspense,
  createRoot,
  createSignal
} from "solid-js";
import { render } from "solid-js/web";
import { vi } from "vitest";
import { createAsync } from "../src/data/createAsync.js";
import { awaitPromise } from "./helpers.js";

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
  test("return 'fallback'", async () => {
    let dispose!: () => void;
    try {
      await new Promise<void>(resolve => {
        createRoot(cleanup => {
          dispose = cleanup;
          const data = createAsync(() => getText());
          setTimeout(() => {
            expect(data()).toBe("fallback");
            resolve();
          }, 1);
        });
      });
    } finally {
      dispose?.();
    }
  });
  test("return 'text'", async () => {
    let dispose!: () => void;
    try {
      await new Promise<void>(resolve => {
        createRoot(cleanup => {
          dispose = cleanup;
          const data = createAsync(() => getText("text"));
          setTimeout(() => {
            expect(data()).toBe("text");
            resolve();
          }, 1);
        });
      });
    } finally {
      dispose?.();
    }
  });
  test("initial error to be caught ", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispose = render(() => {
      const data = createAsync(() => getError());

      return (
        <ErrorBoundary fallback={<div id="childError" />}>
          <Suspense>{data()}</Suspense>
        </ErrorBoundary>
      );
    }, document.body);

    try {
      await awaitPromise();
      expect(document.getElementById("childError")).not.toBeNull();
    } finally {
      consoleError.mockRestore();
      document.body.innerHTML = "";
      dispose();
    }
  });
  test("catch error after arg change - initial valid", async () => {
    async function throwWhenError(arg: string): Promise<string> {
      if (arg === "error") throw new Error("error");
      return arg;
    }

    let setArg!: (value: string) => string;
    const dispose = render(() => {
      const [arg, updateArg] = createSignal("");
      setArg = updateArg;

      const data = createAsync(() => throwWhenError(arg()));

      return (
        <Parent>
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
        </Parent>
      );
    }, document.body);

    try {
      const childErrorElement = () => document.getElementById("childError");
      const parentErrorElement = document.getElementById("parentError");
      expect(childErrorElement()).toBeNull();
      expect(parentErrorElement).toBeNull();

      setArg("error");
      await awaitPromise();

      expect(childErrorElement()).not.toBeNull();
      expect(parentErrorElement).toBeNull();

      document.getElementById("reset")?.click();

      expect(childErrorElement()).toBeNull();
      await awaitPromise();

      expect(document.getElementById("data")).not.toBeNull();
      expect(document.getElementById("data")?.innerHTML).toBe("true");
      expect(document.getElementById("latest")?.innerHTML).toBe("true");
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
  test("catch consecutive error after initial error change to be caught after arg change", async () => {
    let setArg!: (value: string) => string;
    const dispose = render(() => {
      const [arg, updateArg] = createSignal("error");
      setArg = updateArg;

      const data = createAsync(() => getError(arg()));

      return (
        <Parent>
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
        </Parent>
      );
    }, document.body);

    try {
      await awaitPromise();
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      setArg("error_2");
      await awaitPromise();

      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();

      document.getElementById("reset")?.click();
      await awaitPromise();
      expect(document.getElementById("childError")).not.toBeNull();
      expect(document.getElementById("parentError")).toBeNull();
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
});
