import { createRoot, createSignal } from "solid-js";
import { vi } from "vitest";
import { setupNativeEvents } from "./events.js";
import type { RouterContext } from "../types.js";
import { createMockRouter } from "../../test/helpers.js";

vi.mock("../src/data/action.js", () => ({
  actions: new Map()
}));

import { actions } from "./action.js";

vi.mock("../src/utils.js", () => ({
  mockBase: "https://action"
}));

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
    actions.clear();

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

describe("form submit handling", () => {
  let mockRouter: RouterContext;
  let submitHandler: Function;
  let originalDocument: any;

  beforeEach(() => {
    mockRouter = createMockRouter();
    actions.clear();

    originalDocument = global.document;
    global.document = {
      addEventListener: (type: string, handler: Function) => {
        if (type === "submit") submitHandler = handler;
      },
      removeEventListener: vi.fn()
    } as any;

    global.URL = class MockURL {
      pathname: string;
      search: string;

      constructor(url: string, base?: string) {
        this.pathname = url.startsWith("/") ? url : "/action";
        this.search = "";
      }
    } as any;

    setupNativeEvents()(mockRouter);
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  test("handle action form submission", () => {
    return createRoot(() => {
      const mockActionFn = vi.fn();
      const mockAction = {
        url: "https://action/test-action",
        with: vi.fn(),
        call: mockActionFn
      };
      actions.set("https://action/test-action", mockAction as any);

      const form = {
        getAttribute: (name: string) => (name === "action" ? "https://action/test-action" : null),
        method: "POST",
        enctype: "application/x-www-form-urlencoded"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      // Mock FormData and URLSearchParams
      global.FormData = vi.fn(() => ({})) as any;
      global.URLSearchParams = vi.fn(() => ({})) as any;

      submitHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockActionFn).toHaveBeenCalledWith({ r: mockRouter, f: form }, {});
    });
  });

  /**
   * @todo ?
   */
  test("handle multipart form data", () => {
    return createRoot(() => {
      const mockActionFn = vi.fn();
      const mockAction = {
        url: "https://action/test-action",
        with: vi.fn(),
        call: mockActionFn
      };
      actions.set("https://action/test-action", mockAction as any);

      const form = {
        getAttribute: (name: string) => (name === "action" ? "https://action/test-action" : null),
        method: "POST",
        enctype: "multipart/form-data"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      const mockFormData = {};
      global.FormData = vi.fn(() => mockFormData) as any;

      submitHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockActionFn).toHaveBeenCalledWith({ r: mockRouter, f: form }, mockFormData);
    });
  });

  test("Throw when using a `GET` action", () => {
    return createRoot(() => {
      const form = {
        getAttribute: () => "https://action/test-action",
        method: "GET"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      expect(() => submitHandler(event)).toThrow("Only POST forms are supported for Actions");
    });
  });

  test("Throw when using a `PATCH` action", () => {
    return createRoot(() => {
      const form = {
        getAttribute: () => "https://action/test-action",
        method: "PATCH"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      expect(() => submitHandler(event)).toThrow("Only POST forms are supported for Actions");
    });
  });

  test("Throw when using a `DELETE` action", () => {
    return createRoot(() => {
      const form = {
        getAttribute: () => "https://action/test-action",
        method: "DELETE"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      expect(() => submitHandler(event)).toThrow("Only POST forms are supported for Actions");
    });
  });

  test("ignore forms without action handlers", () => {
    return createRoot(() => {
      const form = {
        getAttribute: () => "https://action/unknown-action",
        method: "POST"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      submitHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  test("handle submitter formaction", () => {
    return createRoot(() => {
      const mockActionFn = vi.fn();
      const mockAction = {
        url: "https://action/submitter-action",
        with: vi.fn(),
        call: mockActionFn
      };
      actions.set("https://action/submitter-action", mockAction as any);

      const form = {
        getAttribute: () => "https://action/form-action",
        method: "POST"
      };

      const submitter = {
        hasAttribute: (name: string) => name === "formaction",
        getAttribute: (name: string) =>
          name === "formaction" ? "https://action/submitter-action" : null
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter,
        preventDefault: vi.fn()
      };

      global.FormData = vi.fn(() => ({})) as any;
      global.URLSearchParams = vi.fn(() => ({})) as any;

      submitHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockActionFn).toHaveBeenCalled();
    });
  });

  /**
   * @todo ?
   */
  test("ignore forms with different action base", () => {
    return createRoot(() => {
      mockRouter.parsePath = path => path;

      const form = {
        getAttribute: () => "/different-base/action",
        method: "POST"
      };

      const event = {
        defaultPrevented: false,
        target: form,
        submitter: null,
        preventDefault: vi.fn()
      };

      submitHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
