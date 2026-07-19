import { createRoot } from "solid-js";
import { vi } from "vitest";
import {
  action,
  useAction,
  useSubmission,
  useSubmissions,
  actions,
  type Action
} from "../../src/data/action.js";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

vi.mock("../../src/utils.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/utils.js")>();
  return {
    ...actual,
    mockBase: "https://action"
  };
});

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

  test("disposing an older owner should not unregister a newer action with the same URL", () => {
    const base = action(async (id: string, data: string) => `${id}: ${data}`, "cleanup-test");

    let disposeFirst!: () => void;
    let first!: ReturnType<typeof base.with>;
    createRoot(dispose => {
      disposeFirst = dispose;
      first = base.with("same-args");
    });

    let second!: ReturnType<typeof base.with>;
    createRoot(() => {
      second = base.with("same-args");
    });

    expect(first.url).toBe(second.url);
    expect(actions.get(second.url)).toBe(second);

    // the older owner disposing must not delete the newer registration
    disposeFirst();
    expect(actions.get(second.url)).toBe(second);
  });

  test("disposing the current owner should unregister its action", () => {
    let dispose!: () => void;
    let registered!: Action<[], string>;
    createRoot(d => {
      dispose = d;
      registered = action(async () => "result", "self-cleanup-test");
    });

    expect(actions.get(registered.url)).toBe(registered);
    dispose();
    expect(actions.has(registered.url)).toBe(false);
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

      const submissions = mockRouterContext.submissions[0]();
      expect(submissions).toHaveLength(1);
      expect(submissions[0].input).toEqual(["test-data"]);
      expect(submissions[0].pending).toBe(true);

      const result = await promise;
      expect(result).toBe("processed: test-data");
    });
  });

  test("should handle action errors", async () => {
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

  test("should support `onComplete` callback", async () => {
    return createRoot(async () => {
      const onComplete = vi.fn();
      const testAction = action(async (data: string) => `result: ${data}`, {
        name: "callback-test",
        onComplete
      });

      const boundAction = useAction(testAction);
      await boundAction("test");

      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          result: "result: test",
          error: undefined,
          pending: false
        })
      );
    });
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
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["data2"],
          url: testAction.url,
          result: undefined,
          error: undefined,
          pending: true,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submissions = useSubmissions(testAction);

      expect(submissions).toHaveLength(2);
      expect(submissions[0].input).toEqual(["data1"]);
      expect(submissions[1].input).toEqual(["data2"]);
      expect(submissions.pending).toBe(true);
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
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["skip"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submissions = useSubmissions(testAction, input => input[0] === "keep");

      expect(submissions).toHaveLength(1);
      expect(submissions[0].input).toEqual(["keep"]);
    });
  });

  test("should return pending false when no pending submissions", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "no-pending-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["data"],
          url: testAction.url,
          result: "result",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submissions = useSubmissions(testAction);
      expect(submissions.pending).toBe(false);
    });
  });
});

describe("useSubmission", () => {
  beforeEach(() => {
    mockRouterContext = createMockRouter();
  });

  test("should return latest submission for action", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "latest-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["data1"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["data2"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submission = useSubmission(testAction);

      expect(submission.input).toEqual(["data2"]);
      expect(submission.result).toBe("result2");
    });
  });

  test("should return stub when no submissions exist", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "stub-test");
      const submission = useSubmission(testAction);

      expect(submission.clear).toBeDefined();
      expect(submission.retry).toBeDefined();
      expect(typeof submission.clear).toBe("function");
      expect(typeof submission.retry).toBe("function");
    });
  });

  test("retry and clear should invoke the underlying submission when one exists", () => {
    return createRoot(() => {
      const testAction = action(async () => "result", "retry-test");
      const retry = vi.fn();
      const clear = vi.fn();

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["data"],
          url: testAction.url,
          result: "result",
          error: undefined,
          pending: false,
          clear,
          retry
        }
      ]);

      const submission = useSubmission(testAction);
      (submission.retry as () => void)();
      (submission.clear as () => void)();

      expect(retry).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledTimes(1);
    });
  });

  test("should filter submissions when filter function provided", () => {
    return createRoot(() => {
      const testAction = action(async (data: string) => data, "filter-submission-test");

      mockRouterContext.submissions[1](submissions => [
        ...submissions,
        {
          input: ["skip"],
          url: testAction.url,
          result: "result1",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        },
        {
          input: ["keep"],
          url: testAction.url,
          result: "result2",
          error: undefined,
          pending: false,
          clear: vi.fn(),
          retry: vi.fn()
        }
      ]);

      const submission = useSubmission(testAction, input => input[0] === "keep");

      expect(submission.input).toEqual(["keep"]);
      expect(submission.result).toBe("result2");
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
