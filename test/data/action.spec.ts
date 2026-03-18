import { createRoot } from "solid-js";
import { vi } from "vitest";
import {
  action,
  useAction,
  useSubmissions,
  actions
} from "../../src/data/action.js";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

vi.mock("../../src/utils.js", () => ({
  mockBase: "https://action",
  setFunctionName<T>(obj: T, value: string) {
    Object.defineProperty(obj, "name", {
      value,
      writable: false,
      configurable: false
    });
    return obj;
  }
}));

let mockRouterContext: RouterContext;

vi.mock("../../src/routing.js", () => ({
  useRouter: () => mockRouterContext,
  createRouterContext: () => createMockRouter(),
  RouterContextObj: {},
  RouteContextObj: {},
  useRoute: () => mockRouterContext.base,
  useResolvedPath: () => "/",
  useHref: () => "/",
  useNavigate: () => vi.fn(),
  useLocation: () => mockRouterContext.location,
  useRouteData: () => undefined,
  useMatch: () => null,
  useParams: () => ({}),
  useSearchParams: () => [{}, vi.fn()],
  useIsRouting: () => false,
  usePreloadRoute: () => vi.fn(),
  useBeforeLeave: () => vi.fn()
}));

describe("action", () => {
  beforeEach(() => {
    actions.clear();
    mockRouterContext = createMockRouter();
  });

  test("should create an action function with `url` property", () => {
    const testAction = action(async (data: string) => {
      return `processed: ${data}`;
    }, "test-action");

    expect(typeof testAction).toBe("function");
    expect(testAction.url).toBe("https://action/test-action");
  });

  test("should create action with auto-generated hash when no `name` provided", () => {
    const testFn = async (data: string) => `result: ${data}`;
    const testAction = action(testFn);

    expect(testAction.url).toMatch(/^https:\/\/action\/-?\d+$/);
    expect((testAction as any).name).toMatch(/^-?\d+$/);
  });

  test("should use it as `name` when `options` are provided as a string", () => {
    const testFn = async (data: string) => `result: ${data}`;
    const testAction = action(testFn, "test-action");

    expect(testAction.url).toMatch("https://action/test-action");
    expect((testAction as any).name).toBe("test-action");
  });

  test("should use `name` when provided in object options", () => {
    const testFn = async (data: string) => `result: ${data}`;
    const testAction = action(testFn, { name: "test-action" });

    expect(testAction.url).toMatch("https://action/test-action");
    expect((testAction as any).name).toBe("test-action");
  });

  test("should register action in actions map", () => {
    const testAction = action(async () => "result", "register-test");

    expect(actions.has(testAction.url)).toBe(true);
    expect(actions.get(testAction.url)).toBe(testAction);
  });

  test("should support `.with` method for currying arguments", () => {
    const baseAction = action(async (prefix: string, data: string) => {
      return `${prefix}: ${data}`;
    }, "with-test");

    const curriedAction = baseAction.with("PREFIX");

    expect(typeof curriedAction).toBe("function");
    expect(curriedAction.url).toMatch(/with-test\?args=/);
  });

  test("should execute action and create submission", async () => {
    return createRoot(async () => {
      const testAction = action(async (data: string) => {
        return `processed: ${data}`;
      }, "execute-test");

      const boundAction = useAction(testAction);
      const promise = boundAction("test-data");

      expect(mockRouterContext.submissions[0]()).toHaveLength(0);

      const result = await promise;
      expect(result).toBe("processed: test-data");
      expect(mockRouterContext.submissions[0]()).toEqual([
        expect.objectContaining({
          input: ["test-data"],
          result: "processed: test-data",
          error: undefined,
          url: testAction.url
        })
      ]);
    });
  });

  test("should still record thrown action errors for legacy usage", async () => {
    return createRoot(async () => {
      const errorAction = action(async () => {
        throw new Error("Test error");
      }, "error-test");

      const boundAction = useAction(errorAction);

      try {
        await boundAction();
      } catch (error) {
        expect((error as Error).message).toBe("Test error");
      }

      const submissions = mockRouterContext.submissions[0]();
      expect(submissions[0].error.message).toBe("Test error");
    });
  });

  test("should support `onSettled` callback", async () => {
    return createRoot(async () => {
      const onSettled = vi.fn();
      const testAction = action(async (data: string) => `result: ${data}`, {
        name: "callback-test"
      }).onSettled(onSettled);

      const boundAction = useAction(testAction);
      await boundAction("test");

      expect(onSettled).toHaveBeenCalledWith(
        expect.objectContaining({
          result: "result: test",
          error: undefined
        })
      );
    });
  });

  test("should run onSubmit hook before mutation settles", async () => {
    return createRoot(async () => {
      const order: string[] = [];
      let current = "initial";
      const testAction = action(async (next: string) => {
          order.push("mutation");
          expect(current).toBe(next);
          return next;
        }, "on-submit-test").onSubmit(next => {
          order.push("onSubmit");
          current = next;
        });

      const boundAction = useAction(testAction);
      const result = await boundAction("updated");

      expect(result).toBe("updated");
      expect(order).toEqual(["onSubmit", "mutation"]);
    });
  });

  test("should preserve onSubmit hook for curried actions", async () => {
    return createRoot(async () => {
      const onSubmit = vi.fn();
      const baseAction = action(async (prefix: string, value: string) => `${prefix}:${value}`, "curried-on-submit")
        .onSubmit(onSubmit);

      await useAction(baseAction.with("pre"))("value");

      expect(onSubmit).toHaveBeenCalledWith("pre", "value");
    });
  });

  test("should support onSubmit writing to an optimistic primitive", async () => {
    return createRoot(async () => {
      const solid = (await import("solid-js")) as any;
      const [value, setValue] = solid.createOptimistic("initial");
      const testAction = action(async (next: string) => {
          expect(value()).toBe(next);
          return next;
        }, "optimistic-primitive-test").onSubmit((next: string) => setValue(next));

      const result = await useAction(testAction)("updated");

      expect(result).toBe("updated");
    });
  });

  test("should notify all live onSubmit registrations for an action", async () => {
    const calls: string[] = [];
    const testAction = action(async (value: string) => value, "shared-on-submit");

    createRoot(dispose => {
      testAction.onSubmit(value => calls.push(`one:${value}`));
      return dispose;
    });

    createRoot(dispose => {
      testAction.onSubmit(value => calls.push(`two:${value}`));
      return dispose;
    });

    await testAction.call({ r: createMockRouter() }, "value");

    expect(calls).toEqual(["one:value", "two:value"]);
  });

  test("should clean up onSubmit registrations with owner disposal", async () => {
    const calls: string[] = [];
    const testAction = action(async (value: string) => value, "cleanup-on-submit");
    let disposeFirst!: () => void;
    let disposeSecond!: () => void;

    createRoot(dispose => {
      disposeFirst = dispose;
      testAction.onSubmit(value => calls.push(`one:${value}`));
    });

    createRoot(dispose => {
      disposeSecond = dispose;
      testAction.onSubmit(value => calls.push(`two:${value}`));
    });

    await testAction.call({ r: createMockRouter() }, "first");
    disposeFirst();
    await testAction.call({ r: createMockRouter() }, "second");
    disposeSecond();
    await testAction.call({ r: createMockRouter() }, "third");

    expect(calls).toEqual(["one:first", "two:first", "two:second"]);
  });

  test("should notify all live onSettled registrations for an action", async () => {
    const calls: string[] = [];
    const testAction = action(async (value: string) => value, "shared-on-settled");

    createRoot(dispose => {
      testAction.onSettled(submission => calls.push(`one:${submission.result}`));
      return dispose;
    });

    createRoot(dispose => {
      testAction.onSettled(submission => calls.push(`two:${submission.result}`));
      return dispose;
    });

    await testAction.call({ r: createMockRouter() }, "value");

    expect(calls).toEqual(["one:value", "two:value"]);
  });

  test("should clean up onSettled registrations with owner disposal", async () => {
    const calls: string[] = [];
    const testAction = action(async (value: string) => value, "cleanup-on-settled");
    let disposeFirst!: () => void;
    let disposeSecond!: () => void;

    createRoot(dispose => {
      disposeFirst = dispose;
      testAction.onSettled(submission => calls.push(`one:${submission.result}`));
    });

    createRoot(dispose => {
      disposeSecond = dispose;
      testAction.onSettled(submission => calls.push(`two:${submission.result}`));
    });

    await testAction.call({ r: createMockRouter() }, "first");
    disposeFirst();
    await testAction.call({ r: createMockRouter() }, "second");
    disposeSecond();
    await testAction.call({ r: createMockRouter() }, "third");

    expect(calls).toEqual(["one:first", "two:first", "two:second"]);
  });
});

describe("useSubmissions", () => {
  beforeEach(() => {
    mockRouterContext = createMockRouter();
  });

  test("should return submissions for specific action", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "submissions-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["data1"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["data2"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submissions = useSubmissions(testAction);

      expect(submissions).toHaveLength(2);
      expect(submissions[0].input).toEqual(["data1"]);
      expect(submissions[1].input).toEqual(["data2"]);
    });
  });

  test("should filter submissions when filter function provided", () => {
    return createRoot(() => {
      const testAction = action(async (data: string) => data, "filter-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["keep"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["skip"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submissions = useSubmissions(testAction, input => input[0] === "keep");

      expect(submissions).toHaveLength(1);
      expect(submissions[0].input).toEqual(["keep"]);
    });
  });

  test("should return an empty array when no submissions match", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "no-pending-test");

      const submissions = useSubmissions(testAction, () => false);
      expect(submissions).toHaveLength(0);
    });
  });

  test("should allow reading the latest submission with at(-1)", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "latest-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["data1"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["data2"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submission = useSubmissions(testAction).at(-1);

      expect(submission?.input).toEqual(["data2"]);
      expect(submission?.result).toBe("result2");
    });
  });

  test("should return undefined from at(-1) when no submissions exist", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "empty-latest-test");
      const submission = useSubmissions(testAction).at(-1);

      expect(submission).toBeUndefined();
    });
  });

  test("should allow filtering before reading the latest submission", () => {
    return createRoot(() => {
      const testAction = action(async (data: string) => data, "filter-submission-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["skip"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["keep"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submission = useSubmissions(testAction, input => input[0] === "keep").at(-1);

      expect(submission?.input).toEqual(["keep"]);
      expect(submission?.result).toBe("result2");
    });
  });
});

describe("useAction", () => {
  beforeEach(() => {
    mockRouterContext = createMockRouter();
  });

  test("should return bound action function", () => {
    return createRoot(() => {
      const testAction = action(async (data: string) => `result: ${data}`, "bound-test");
      const boundAction = useAction(testAction);

      expect(typeof boundAction).toBe("function");
    });
  });

  test("should execute action through useAction", async () => {
    return createRoot(async () => {
      const testAction = action(async (data: string) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return `result: ${data}`;
      }, "context-test");

      const boundAction = useAction(testAction);
      const result = await boundAction("test-data");

      expect(result).toBe("result: test-data");
    });
  });
});
