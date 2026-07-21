import { createRoot, createSignal } from "solid-js";
import { vi } from "vitest";
import { setRouterFormHandler, setupNativeEvents } from "../../src/data/events.js";
import type { RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

class MockNode {
  nodeName: string;
  namespaceURI: string | null;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  href: any;
  target: any;

  constructor(tagName: string, attributes: Record<string, string> = {}) {
    this.nodeName = tagName.toUpperCase();
    this.namespaceURI = tagName === "a" && attributes.svg ? "http://www.w3.org/2000/svg" : null;
    this.hasAttribute = (name: string) => name in attributes;
    this.getAttribute = (name: string) => attributes[name] || null;
    this.href = attributes.href || "";
    this.target = attributes.target || "";

    if (tagName === "a" && attributes.svg) {
      this.href = { baseVal: attributes.href || "" };
      this.target = { baseVal: attributes.target || "" };
    }
  }
}

global.Node = MockNode as any;

const createMockElement = (tagName: string, attributes: Record<string, string> = {}) => {
  return new MockNode(tagName, attributes);
};

const createMockEvent = (type: string, target: any, options: any = {}) => {
  return {
    type,
    target,
    defaultPrevented: false,
    button: options.button || 0,
    metaKey: options.metaKey || false,
    altKey: options.altKey || false,
    ctrlKey: options.ctrlKey || false,
    shiftKey: options.shiftKey || false,
    submitter: options.submitter || null,
    preventDefault: vi.fn(),
    composedPath: () => options.path || [target]
  } as any;
};

describe("setupNativeEvents", () => {
  let mockRouter: RouterContext;
  let addEventListener: ReturnType<typeof vi.fn>;
  let removeEventListener: ReturnType<typeof vi.fn>;
  let mockWindow: any;
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    mockRouter = createMockRouter();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();

    originalDocument = global.document;
    global.document = {
      addEventListener,
      removeEventListener,
      baseURI: "https://example.com/"
    } as any;

    originalWindow = global.window;
    mockWindow = {
      location: { origin: "https://example.com" }
    };
    global.window = mockWindow;

    global.URL = class MockURL {
      origin: string;
      pathname: string;
      search: string;
      hash: string;

      constructor(url: string, base?: string) {
        const fullUrl = base ? new URL(url, base).href : url;
        const parsed = new URL(fullUrl);
        this.origin = parsed.origin;
        this.pathname = parsed.pathname;
        this.search = parsed.search;
        this.hash = parsed.hash;
      }
    } as any;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  test("should set up default event listeners", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      expect(addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("submit", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function), {
        passive: true
      });
      expect(addEventListener).toHaveBeenCalledWith("focusin", expect.any(Function), {
        passive: true
      });
      expect(addEventListener).toHaveBeenCalledWith("touchstart", expect.any(Function), {
        passive: true
      });
    });
  });

  test("should skip preload listeners when preload disabled", () => {
    return createRoot(() => {
      setupNativeEvents({ preload: false })(mockRouter);

      expect(addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("submit", expect.any(Function));
      expect(addEventListener).not.toHaveBeenCalledWith("mousemove", expect.any(Function), {
        passive: true
      });
      expect(addEventListener).not.toHaveBeenCalledWith("focusin", expect.any(Function), {
        passive: true
      });
      expect(addEventListener).not.toHaveBeenCalledWith("touchstart", expect.any(Function), {
        passive: true
      });
    });
  });

  test("should clean up event listeners on cleanup", () => {
    return createRoot(dispose => {
      setupNativeEvents()(mockRouter);

      dispose();

      expect(removeEventListener).toHaveBeenCalledWith("click", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("submit", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("focusin", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("touchstart", expect.any(Function));
    });
  });
});

describe("anchor link handling", () => {
  let mockRouter: RouterContext;
  let clickHandler: Function;
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    mockRouter = createMockRouter();

    originalDocument = global.document;
    global.document = {
      addEventListener: (type: string, handler: Function) => {
        if (type === "click") clickHandler = handler;
      },
      removeEventListener: vi.fn(),
      baseURI: "https://example.com/"
    } as any;

    originalWindow = global.window;
    global.window = {
      location: { origin: "https://example.com" }
    } as any;

    global.URL = class MockURL {
      origin: string;
      pathname: string;
      search: string;
      hash: string;

      constructor(url: string) {
        if (url.startsWith("/")) {
          this.origin = "https://example.com";
          this.pathname = url;
          this.search = "";
          this.hash = "";
        } else if (url.startsWith("https://example.com")) {
          this.origin = "https://example.com";
          this.pathname = url.replace("https://example.com", "") || "/";
          this.search = "";
          this.hash = "";
        } else {
          this.origin = "https://other.com";
          this.pathname = "/";
          this.search = "";
          this.hash = "";
        }
      }
    } as any;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  test("should handle internal link clicks", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(navigateFromRoute).toHaveBeenCalledWith("/test-page", {
        resolve: false,
        replace: false,
        scroll: true,
        state: undefined
      });
    });
  });

  test("should ignore external link clicks", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "https://external.com/page" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("should ignore clicks with modifier keys", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page" });
      const event = createMockEvent("click", link, {
        path: [link],
        metaKey: true
      });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  /**
   * @todo ?
   */
  test("should ignore non-zero button clicks", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page" });
      const event = createMockEvent("click", link, {
        path: [link],
        button: 1
      });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("should handle replace attribute", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", replace: "true" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(navigateFromRoute).toHaveBeenCalledWith("/test-page", {
        resolve: false,
        replace: true,
        scroll: true,
        state: undefined
      });
    });
  });

  test("should handle noscroll attribute", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", noscroll: "true" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(navigateFromRoute).toHaveBeenCalledWith("/test-page", {
        resolve: false,
        replace: false,
        scroll: false,
        state: undefined
      });
    });
  });

  test("should handle state attribute", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const stateData = '{"key":"value"}';
      const link = createMockElement("a", { href: "/test-page", state: stateData });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(navigateFromRoute).toHaveBeenCalledWith("/test-page", {
        resolve: false,
        replace: false,
        scroll: true,
        state: { key: "value" }
      });
    });
  });

  /**
   * @todo ?
   */
  test("should handle SVG links", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", svg: "true" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(navigateFromRoute).toHaveBeenCalledWith("/test-page", {
        resolve: false,
        replace: false,
        scroll: true,
        state: undefined
      });
    });
  });

  test("should ignore links with download attribute", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", download: "file.pdf" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("should ignore links with external rel", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", rel: "external" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("should ignore links with target", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/test-page", target: "_blank" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  /**
   * @todo ?
   */
  test("should require `link` attribute when `explicitLinks` enabled", () => {
    return createRoot(() => {
      // Reset with explicitLinks enabled
      setupNativeEvents({ preload: true, explicitLinks: true })(mockRouter);

      const link = createMockElement("a", { href: "/test-page" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("should handle links with `link` attribute when `explicitLinks` enabled", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      // Reset with explicitLinks enabled
      setupNativeEvents({ preload: true, explicitLinks: true })(mockRouter);

      const link = createMockElement("a", { href: "/test-page", link: "true" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(navigateFromRoute).toHaveBeenCalled();
    });
  });
});

// The action-lookup/invocation behavior these events used to exercise moved
// with the handler into data/action.ts (see `handleFormAction` in
// test/data/action.spec.ts). Delegation's remaining job is consulting the
// registered form-handler slot.
describe("form submit handling", () => {
  let mockRouter: RouterContext;
  let submitHandler: Function;
  let originalDocument: any;
  let disposeEvents: (() => void) | undefined;

  beforeEach(() => {
    mockRouter = createMockRouter();

    originalDocument = global.document;
    global.document = {
      addEventListener: (type: string, handler: Function) => {
        if (type === "submit") submitHandler = handler;
      },
      removeEventListener: vi.fn()
    } as any;
  });

  afterEach(() => {
    disposeEvents?.();
    disposeEvents = undefined;
    setRouterFormHandler(undefined);
    global.document = originalDocument;
  });

  const mount = (config?: Parameters<typeof setupNativeEvents>[0]) => {
    disposeEvents = createRoot(dispose => {
      setupNativeEvents(config)(mockRouter);
      return dispose;
    });
  };

  test("consults the registered form handler with the router and default action base", () => {
    const handler = vi.fn();
    setRouterFormHandler(handler);
    mount();

    const event = {
      defaultPrevented: false,
      target: {},
      submitter: null,
      preventDefault: vi.fn()
    };
    submitHandler(event);

    expect(handler).toHaveBeenCalledWith(event, mockRouter, "/_server");
  });

  test("passes a configured actionBase through to the handler", () => {
    const handler = vi.fn();
    setRouterFormHandler(handler);
    mount({ actionBase: "/custom-base" });

    const event = {
      defaultPrevented: false,
      target: {},
      submitter: null,
      preventDefault: vi.fn()
    };
    submitHandler(event);

    expect(handler).toHaveBeenCalledWith(event, mockRouter, "/custom-base");
  });

  test("does nothing when no form handler is registered and no action attribute", () => {
    mount();

    const event = {
      defaultPrevented: false,
      target: { getAttribute: () => null },
      submitter: null,
      preventDefault: vi.fn()
    };

    expect(() => submitHandler(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// With no form handler installed at all — no action module in the client
// graph — delegation still intercepts posts to server-action urls (server
// components binding forms straight to server functions) and loads the
// handler lazily. No-JS treatment is reserved for clients with no JS.
describe("form submit lazy fallback", () => {
  let mockRouter: RouterContext;
  let submitHandler: Function;
  let originalDocument: any;
  let originalFormData: any;
  let disposeEvents: (() => void) | undefined;

  beforeEach(() => {
    mockRouter = createMockRouter();

    originalDocument = global.document;
    global.document = {
      addEventListener: (type: string, handler: Function) => {
        if (type === "submit") submitHandler = handler;
      },
      removeEventListener: vi.fn(),
      baseURI: "https://example.com/"
    } as any;
    originalFormData = global.FormData;
    global.FormData = vi.fn(() => ({})) as any;
  });

  afterEach(() => {
    disposeEvents?.();
    disposeEvents = undefined;
    setRouterFormHandler(undefined);
    global.document = originalDocument;
    global.FormData = originalFormData;
    vi.restoreAllMocks();
    vi.doUnmock("../../src/data/serverForms.js");
  });

  const mount = () => {
    disposeEvents = createRoot(dispose => {
      setupNativeEvents()(mockRouter);
      return dispose;
    });
  };

  const createSubmitEvent = (attributes: Record<string, string | null>, method = "POST") => ({
    defaultPrevented: false,
    target: {
      getAttribute: (name: string) => attributes[name] ?? null,
      method,
      enctype: "application/x-www-form-urlencoded"
    },
    submitter: null,
    preventDefault: vi.fn()
  });

  test("intercepts posts to server-action urls and loads the handler lazily", async () => {
    const submitServerForm = vi.fn();
    vi.doMock("../../src/data/serverForms.js", () => ({ submitServerForm }));
    mount();

    const event = createSubmitEvent({ action: "/_server?id=echo%230&args=%5B7%5D" });
    submitHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(submitServerForm).toHaveBeenCalled());
    expect(submitServerForm).toHaveBeenCalledWith(
      mockRouter,
      "/_server?id=echo%230&args=%5B7%5D",
      event.target,
      expect.anything()
    );
    // the FormData is captured synchronously, before the module loads
    expect(global.FormData).toHaveBeenCalledWith(event.target, null);
  });

  test("ignores client-only action urls", () => {
    mount();

    const event = createSubmitEvent({ action: "https://action/my-client-action" });
    submitHandler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("ignores urls outside the action base", () => {
    mount();

    const event = createSubmitEvent({ action: "/api/legacy-endpoint" });
    submitHandler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("ignores non-POST forms", () => {
    mount();

    const event = createSubmitEvent({ action: "/_server?id=echo%230" }, "GET");
    submitHandler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("prefers the submitter's formaction", async () => {
    const submitServerForm = vi.fn();
    vi.doMock("../../src/data/serverForms.js", () => ({ submitServerForm }));
    mount();

    const event = createSubmitEvent({ action: "/elsewhere" });
    (event as any).submitter = {
      hasAttribute: (name: string) => name === "formaction",
      getAttribute: (name: string) => (name === "formaction" ? "/_server?id=other%230" : null)
    };
    submitHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(submitServerForm).toHaveBeenCalled());
    expect(submitServerForm.mock.calls[0][1]).toBe("/_server?id=other%230");
  });
});
