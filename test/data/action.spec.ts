import { createRoot } from "solid-js";
import { vi } from "vitest";
import {
  action,
  useAction,
  useSubmissions,
  actions,
  handleFormAction,
  type Action
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
  provideFlightConsumer: vi.fn(),
  provideFlashDecoder: vi.fn(),
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

  // actions are invoked outside `createRoot` — as of Solid 2.0.0-beta.18 calling an
  // action inside an owned scope throws ACTION_CALLED_IN_OWNED_SCOPE in dev
  test("should execute action and create submission", async () => {
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

  test("should still record thrown action errors for legacy usage", async () => {
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

  test("should support `onSettled` callback", async () => {
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

  test("should run onSubmit hook before mutation settles", async () => {
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

  test("should preserve onSubmit hook for curried actions", async () => {
    const onSubmit = vi.fn();
    const baseAction = action(async (prefix: string, value: string) => `${prefix}:${value}`, "curried-on-submit")
      .onSubmit(onSubmit);

    await useAction(baseAction.with("pre"))("value");

    expect(onSubmit).toHaveBeenCalledWith("pre", "value");
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
    const testAction = action(async (data: string) => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return `result: ${data}`;
    }, "context-test");

    const boundAction = useAction(testAction);
    const result = await boundAction("test-data");

    expect(result).toBe("result: test-data");
  });
});

// The form half of the attribute vocabulary: a form submitted through
// delegation is `aria-busy` while its action is in flight — same CSS story
// as `data-active`/`data-pending` on links.
describe("form aria-busy", () => {
  beforeEach(() => {
    actions.clear();
    mockRouterContext = createMockRouter();
  });

  // invoke the action the way handleFormAction does: with the form as context
  const submitViaForm = (act: Action<any, any>, form: HTMLFormElement, data: any = {}) =>
    (act as any).call({ r: mockRouterContext, f: form }, data);

  test("marks the form while the action is in flight and clears after settle", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const busyAction = action(async () => {
      await gate;
      return "done";
    }, "busy-test");
    const form = document.createElement("form");

    const promise = submitViaForm(busyAction, form);
    expect(form.getAttribute("aria-busy")).toBe("true");

    release();
    await promise;
    expect(form.hasAttribute("aria-busy")).toBe(false);
  });

  test("clears even when the action errors", async () => {
    let reject!: (e: Error) => void;
    const gate = new Promise<void>((_, r) => (reject = r));
    const failing = action(async () => {
      await gate;
    }, "busy-error-test");
    const form = document.createElement("form");

    const promise = submitViaForm(failing, form);
    expect(form.getAttribute("aria-busy")).toBe("true");

    reject(new Error("boom"));
    // form submissions record errors on the submission instead of throwing
    await promise;
    expect(form.hasAttribute("aria-busy")).toBe(false);
    expect(mockRouterContext.submissions[0]()[0].error.message).toBe("boom");
  });

  test("stays busy across overlapping submissions of the same form", async () => {
    const releases: (() => void)[] = [];
    const overlapping = action(
      () => new Promise<void>(resolve => releases.push(resolve)),
      "busy-overlap-test"
    );
    const form = document.createElement("form");

    const first = submitViaForm(overlapping, form);
    const second = submitViaForm(overlapping, form);
    expect(form.getAttribute("aria-busy")).toBe("true");

    releases[0]();
    await first;
    expect(form.getAttribute("aria-busy")).toBe("true");

    releases[1]();
    await second;
    expect(form.hasAttribute("aria-busy")).toBe(false);
  });

  test("does not touch forms for programmatic (formless) calls", async () => {
    const plain = action(async () => "ok", "busy-formless-test");
    await useAction(plain)();
    // nothing to assert on a form — the run simply must not throw without one
    expect(mockRouterContext.submissions[0]()).toHaveLength(1);
  });
});

// Delegated form-submit behavior. The handler body lived in
// data/events.ts's handleFormSubmit before the decoupling; delegation now
// consults a slot (see test/data/events.spec.ts) and this is the handler
// the action side installs into it.
describe("handleFormAction", () => {
  const ACTION_BASE = "/_server";
  let originalFormData: any;
  let originalURLSearchParams: any;

  beforeEach(() => {
    actions.clear();
    mockRouterContext = createMockRouter();
    originalFormData = global.FormData;
    originalURLSearchParams = global.URLSearchParams;
  });

  afterEach(() => {
    global.FormData = originalFormData;
    global.URLSearchParams = originalURLSearchParams;
  });

  const registerMockAction = (url: string) => {
    const mockActionFn = vi.fn();
    actions.set(url, { url, with: vi.fn(), call: mockActionFn } as any);
    return mockActionFn;
  };

  const createSubmitEvent = (form: any, submitter: any = null) =>
    ({
      defaultPrevented: false,
      target: form,
      submitter,
      preventDefault: vi.fn()
    }) as any;

  test("invokes the registered action with the router and form", () => {
    const mockActionFn = registerMockAction("https://action/test-action");
    const form = {
      getAttribute: (name: string) => (name === "action" ? "https://action/test-action" : null),
      method: "POST",
      enctype: "application/x-www-form-urlencoded"
    };
    const event = createSubmitEvent(form);

    global.FormData = vi.fn(() => ({})) as any;
    global.URLSearchParams = vi.fn(() => ({})) as any;

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockActionFn).toHaveBeenCalledWith({ r: mockRouterContext, f: form }, {});
  });

  test("passes FormData through for multipart forms", () => {
    const mockActionFn = registerMockAction("https://action/test-action");
    const form = {
      getAttribute: (name: string) => (name === "action" ? "https://action/test-action" : null),
      method: "POST",
      enctype: "multipart/form-data"
    };
    const event = createSubmitEvent(form);

    const mockFormData = {};
    global.FormData = vi.fn(() => mockFormData) as any;

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockActionFn).toHaveBeenCalledWith({ r: mockRouterContext, f: form }, mockFormData);
  });

  test.each(["GET", "PATCH", "DELETE"])("throws for a `%s` form method", method => {
    const form = {
      getAttribute: () => "https://action/test-action",
      method
    };
    const event = createSubmitEvent(form);

    expect(() => handleFormAction(event, mockRouterContext, ACTION_BASE)).toThrow(
      "Only POST forms are supported for Actions"
    );
  });

  test("ignores forms without a registered action", () => {
    const form = {
      getAttribute: () => "https://action/unknown-action",
      method: "POST"
    };
    const event = createSubmitEvent(form);

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("ignores already-handled events", () => {
    const mockActionFn = registerMockAction("https://action/test-action");
    const form = {
      getAttribute: () => "https://action/test-action",
      method: "POST"
    };
    const event = createSubmitEvent(form);
    event.defaultPrevented = true;

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(mockActionFn).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("prefers the submitter's formaction over the form's action", () => {
    const mockActionFn = registerMockAction("https://action/submitter-action");
    const form = {
      getAttribute: () => "https://action/form-action",
      method: "POST"
    };
    const submitter = {
      hasAttribute: (name: string) => name === "formaction",
      getAttribute: (name: string) =>
        name === "formaction" ? "https://action/submitter-action" : null
    };
    const event = createSubmitEvent(form, submitter);

    global.FormData = vi.fn(() => ({})) as any;
    global.URLSearchParams = vi.fn(() => ({})) as any;

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockActionFn).toHaveBeenCalled();
  });

  test("ignores server actions outside the action base", () => {
    mockRouterContext.parsePath = path => path;
    const form = {
      getAttribute: () => "/different-base/action",
      method: "POST"
    };
    const event = createSubmitEvent(form);

    handleFormAction(event, mockRouterContext, ACTION_BASE);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
