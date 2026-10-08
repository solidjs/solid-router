import { claimElement } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { vi } from "vitest";
import { setRouterFormHandler, setupNativeEvents } from "../../src/data/events.js";
import { eagerPreload, intentPreload, tapPreload, viewportPreload } from "../../src/preload.js";
import { preloadRoute } from "../../src/preloadRoute.js";
import type { LinkPreload, RouterContext } from "../../src/types.js";
import { createMockRouter } from "../helpers.js";

vi.mock("../../src/preloadRoute.js", () => ({ preloadRoute: vi.fn() }));

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

const RealNode = global.Node;
const RealURL = global.URL;
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

  test("should set up only click and submit listeners by default", () => {
    return createRoot(() => {
      setupNativeEvents()(mockRouter);

      expect(addEventListener.mock.calls.map(c => c[0]).sort()).toEqual(["click", "submit"]);
    });
  });

  test("should ignore a boolean preload option", () => {
    return createRoot(() => {
      setupNativeEvents({ preload: true as any })(mockRouter);

      expect(addEventListener.mock.calls.map(c => c[0]).sort()).toEqual(["click", "submit"]);
    });
  });

  test("should set up intent preload listeners", () => {
    return createRoot(() => {
      setupNativeEvents({ preload: intentPreload() })(mockRouter);

      for (const type of ["mousemove", "focusin", "touchstart"])
        expect(addEventListener).toHaveBeenCalledWith(type, expect.any(Function), {
          passive: true
        });
    });
  });

  test("should clean up event listeners on cleanup", () => {
    return createRoot(dispose => {
      setupNativeEvents({ preload: [intentPreload()] })(mockRouter);

      dispose();

      for (const type of ["click", "submit", "mousemove", "focusin", "touchstart"])
        expect(removeEventListener).toHaveBeenCalledWith(type, expect.any(Function));
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
      protocol: string;
      origin: string;
      pathname: string;
      search: string;
      hash: string;

      constructor(url: string) {
        if (url.startsWith("blob:")) {
          // blob: URLs inherit the page origin, so the origin check alone
          // would let them through — they must be rejected by protocol. #382
          this.protocol = "blob:";
          this.origin = "https://example.com";
          this.pathname = url;
          this.search = "";
          this.hash = "";
        } else if (url.startsWith("/")) {
          this.protocol = "https:";
          this.origin = "https://example.com";
          this.pathname = url;
          this.search = "";
          this.hash = "";
        } else if (url.startsWith("https://example.com")) {
          this.protocol = "https:";
          this.origin = "https://example.com";
          this.pathname = url.replace("https://example.com", "") || "/";
          this.search = "";
          this.hash = "";
        } else {
          this.protocol = "https:";
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

  test("should ignore non-http(s) links like blob: (#382)", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      // With no base path, a blob: link shares the page origin and its pathname
      // isn't caught by the path-prefix check — so it must be rejected by
      // protocol, else the router routes a garbage pathname (#382).
      mockRouter.base = { path: () => "" } as any;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "blob:https://example.com/abc" });
      const event = createMockEvent("click", link, { path: [link] });

      clickHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(navigateFromRoute).not.toHaveBeenCalled();
    });
  });

  test("only intercepts links under the base path on a segment boundary", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      mockRouter.base = { path: () => "/app" } as any;
      setupNativeEvents()(mockRouter);

      const click = (href: string) => {
        const link = createMockElement("a", { href });
        const event = createMockEvent("click", link, { path: [link] });
        clickHandler(event);
        return event.preventDefault.mock.calls.length > 0;
      };

      expect(click("/apple")).toBe(false);
      expect(click("/application/x")).toBe(false);
      expect(click("/app")).toBe(true);
      expect(click("/app/")).toBe(true);
      expect(click("/app/x")).toBe(true);
      expect(click("/APP/x")).toBe(true);
    });
  });

  test("intercepts every same-origin path without a base", () => {
    return createRoot(() => {
      const navigateFromRoute = vi.fn();
      mockRouter.navigatorFactory = () => navigateFromRoute;
      setupNativeEvents()(mockRouter);

      const link = createMockElement("a", { href: "/apple" });
      const event = createMockEvent("click", link, { path: [link] });
      clickHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(navigateFromRoute).toHaveBeenCalledWith("/apple", expect.anything());
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
      setupNativeEvents({ explicitLinks: true })(mockRouter);

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
      setupNativeEvents({ explicitLinks: true })(mockRouter);

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
    global.FormData = vi.fn(function () {
      return {};
    }) as any;
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

    const event = createSubmitEvent({ action: "/_server/echo%230?args=%5B7%5D" });
    submitHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(submitServerForm).toHaveBeenCalled());
    expect(submitServerForm).toHaveBeenCalledWith(
      mockRouter,
      "/_server/echo%230?args=%5B7%5D",
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

    const event = createSubmitEvent({ action: "/_server/echo%230" }, "GET");
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
      getAttribute: (name: string) => (name === "formaction" ? "/_server/other%230" : null)
    };
    submitHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(submitServerForm).toHaveBeenCalled());
    expect(submitServerForm.mock.calls[0][1]).toBe("/_server/other%230");
  });
});

// Preload triggers dispatched as the browser does: focus and touch events
// carry no `button`, so they must not go through the click gate.
describe("intentPreload", () => {
  let mockRouter: RouterContext;
  let link: HTMLAnchorElement;
  let dispose: (() => void) | undefined;

  const mount = (preload: LinkPreload | LinkPreload[] | undefined) =>
    (dispose = createRoot(d => (setupNativeEvents({ preload })(mockRouter), d)));

  beforeEach(() => {
    global.Node = RealNode;
    global.URL = RealURL;
    mockRouter = createMockRouter();
    vi.mocked(preloadRoute).mockClear();
    link = document.createElement("a");
    link.href = "/target";
    document.body.append(link);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    link.remove();
    global.Node = MockNode as any;
  });

  test("focusin preloads code and data", () => {
    mount(intentPreload());
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(preloadRoute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(preloadRoute).mock.calls[0][1].pathname).toBe("/target");
    expect(vi.mocked(preloadRoute).mock.calls[0][2]).toBe(true);
  });

  test("touchstart preloads", () => {
    mount(intentPreload());
    link.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    expect(preloadRoute).toHaveBeenCalledTimes(1);
  });

  test("mousemove preloads once the pointer rests, once per link", async () => {
    mount(intentPreload());
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(preloadRoute).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 30));
    expect(preloadRoute).toHaveBeenCalledTimes(1);
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(preloadRoute).toHaveBeenCalledTimes(1);
  });

  test("a custom delay holds the hover preload", async () => {
    mount(intentPreload({ delay: 60 }));
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(preloadRoute).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 50));
    expect(preloadRoute).toHaveBeenCalledTimes(1);
  });

  test("data: false preloads code only", () => {
    mount(intentPreload({ data: false }));
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(preloadRoute).toHaveBeenCalledWith(mockRouter, expect.any(URL), false);
  });

  test('preload="false" opts the link out entirely', async () => {
    mount(intentPreload());
    link.setAttribute("preload", "false");
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    link.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(preloadRoute).not.toHaveBeenCalled();
  });

  test("without a strategy nothing preloads", () => {
    mount(undefined);
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(preloadRoute).not.toHaveBeenCalled();
  });

  test("disposal removes the listeners and a pending hover", async () => {
    mount(intentPreload());
    link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    dispose!();
    dispose = undefined;
    link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(preloadRoute).not.toHaveBeenCalled();
  });
});

describe("tap and ambient preload strategies", () => {
  class MockObserver {
    static instances: MockObserver[] = [];
    observed = new Set<Element>();
    constructor(
      public callback: IntersectionObserverCallback,
      public options?: IntersectionObserverInit
    ) {
      MockObserver.instances.push(this);
    }
    observe = vi.fn((el: Element) => void this.observed.add(el));
    unobserve = vi.fn((el: Element) => void this.observed.delete(el));
    disconnect = vi.fn(() => this.observed.clear());
    intersect(el: Element, isIntersecting = true) {
      if (this.observed.has(el))
        this.callback([{ target: el, isIntersecting } as any], this as any);
    }
  }

  let mockRouter: RouterContext;
  let dispose: (() => void) | undefined;
  const links: HTMLAnchorElement[] = [];

  const mount = (preload: LinkPreload | LinkPreload[]) =>
    (dispose = createRoot(d => (setupNativeEvents({ preload })(mockRouter), d)));

  // created and claimed as compiled JSX does, under an owner of its own
  const link = (attributes: Record<string, string>) => {
    const a = document.createElement("a");
    for (const name in attributes) a.setAttribute(name, attributes[name]);
    document.body.append(a);
    links.push(a);
    const disposeLink = createRoot(d => (claimElement(a), d));
    return Object.assign(a, { disposeLink });
  };

  const preloaded = () =>
    vi.mocked(preloadRoute).mock.calls.map(([, url, data]) => `${url.pathname}:${data}`);

  const observer = () => MockObserver.instances[0];

  beforeEach(() => {
    global.Node = RealNode;
    global.URL = RealURL;
    mockRouter = createMockRouter();
    vi.mocked(preloadRoute).mockClear();
    MockObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockObserver);
    vi.useFakeTimers();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    links.splice(0).forEach(a => a.remove());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    global.Node = MockNode as any;
  });

  describe("tapPreload", () => {
    test("pointerdown preloads code and data", () => {
      mount(tapPreload());
      const a = link({ href: "/a" });
      a.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(preloaded()).toEqual(["/a:true"]);
    });

    test('data: false preloads code only; preload="false" opts out', () => {
      mount(tapPreload({ data: false }));
      link({ href: "/a" }).dispatchEvent(new Event("pointerdown", { bubbles: true }));
      link({ href: "/b", preload: "false" }).dispatchEvent(
        new Event("pointerdown", { bubbles: true })
      );
      expect(preloaded()).toEqual(["/a:false"]);
    });

    test("disposal removes the listener", () => {
      mount([tapPreload()]);
      dispose!();
      dispose = undefined;
      link({ href: "/a" }).dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(preloaded()).toEqual([]);
    });
  });

  describe("viewportPreload", () => {
    test("one shared observer, created on the first claim", () => {
      mount(viewportPreload({ rootMargin: "200px" }));
      expect(MockObserver.instances).toHaveLength(0);
      const a = link({ href: "/a" });
      const b = link({ href: "/b" });
      expect(MockObserver.instances).toHaveLength(1);
      expect(observer().options).toEqual({ rootMargin: "200px" });
      expect(observer().observe.mock.calls.map(c => c[0])).toEqual([a, b]);
    });

    test("intersect, stay for the delay, then preload code once at idle", () => {
      mount(viewportPreload());
      const a = link({ href: "/a", preload: "viewport" });
      observer().intersect(a);
      vi.advanceTimersByTime(99);
      expect(preloaded()).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(preloaded()).toEqual([]);
      vi.runOnlyPendingTimers();
      expect(preloaded()).toEqual(["/a:false"]);
      expect(observer().unobserve).toHaveBeenCalledWith(a);
      observer().intersect(a);
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:false"]);
    });

    test("prefers requestIdleCallback when available", () => {
      const idle = vi.fn((fn: () => void) => setTimeout(fn, 50));
      vi.stubGlobal("requestIdleCallback", idle);
      mount(viewportPreload({ delay: 0 }));
      const a = link({ href: "/a", preload: "viewport" });
      observer().intersect(a);
      vi.advanceTimersByTime(0);
      expect(idle).toHaveBeenCalledTimes(1);
      expect(preloaded()).toEqual([]);
      vi.advanceTimersByTime(50);
      expect(preloaded()).toEqual(["/a:false"]);
    });

    test("leaving before the delay or before the idle flush cancels", () => {
      mount(viewportPreload());
      const a = link({ href: "/a", preload: "viewport" });
      observer().intersect(a);
      vi.advanceTimersByTime(50);
      observer().intersect(a, false);
      vi.runAllTimers();
      expect(preloaded()).toEqual([]);
      observer().intersect(a);
      vi.advanceTimersByTime(100);
      observer().intersect(a, false);
      vi.runAllTimers();
      expect(preloaded()).toEqual([]);
      observer().intersect(a);
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:false"]);
    });

    test("an href re-claim re-arms the link, resolving its new URL", () => {
      mount(viewportPreload());
      const a = link({ href: "/a", preload: "viewport" });
      observer().intersect(a);
      vi.runAllTimers();
      a.setAttribute("href", "/b");
      // the re-claim runs under the effect writing `href`, which outlives
      // neither the anchor nor its arming
      createRoot(d => (claimElement(a), d))();
      observer().intersect(a);
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:false", "/b:false"]);
    });

    test('preload="viewport" opts in; `all` takes every link but preload="false"', () => {
      mount([viewportPreload(), viewportPreload({ all: true, data: true })]);
      const named = link({ href: "/named", preload: "viewport" });
      const plain = link({ href: "/plain" });
      const off = link({ href: "/off", preload: "false" });
      const [scoped, all] = MockObserver.instances;
      for (const io of [scoped, all]) [named, plain, off].forEach(a => io.intersect(a));
      vi.runAllTimers();
      expect(preloaded().sort()).toEqual(["/named:false", "/named:true", "/plain:true"]);
    });

    test("reads opt-in when preloading: attributes may land after the claim", () => {
      mount(viewportPreload());
      const a = link({ href: "/a" });
      a.setAttribute("preload", "viewport");
      observer().intersect(a);
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:false"]);
    });

    test("skips preloading under Save-Data or a 2g connection", () => {
      for (const connection of [{ saveData: true }, { effectiveType: "slow-2g" }]) {
        vi.stubGlobal("navigator", { ...navigator, connection });
        mount(viewportPreload({ all: true }));
        const a = link({ href: "/a" });
        MockObserver.instances.at(-1)!.intersect(a);
        vi.runAllTimers();
        dispose!();
      }
      dispose = undefined;
      expect(preloaded()).toEqual([]);
    });

    test("a disposed link is unobserved; disposing the router disconnects", () => {
      mount(viewportPreload({ all: true }));
      const a = link({ href: "/a" });
      const b = link({ href: "/b" });
      observer().intersect(a);
      a.disposeLink();
      expect(observer().unobserve).toHaveBeenCalledWith(a);
      observer().intersect(b);
      dispose!();
      dispose = undefined;
      expect(observer().disconnect).toHaveBeenCalled();
      vi.runAllTimers();
      expect(preloaded()).toEqual([]);
    });

    test("does nothing without IntersectionObserver", () => {
      vi.stubGlobal("IntersectionObserver", undefined);
      mount(viewportPreload({ all: true }));
      expect(() => link({ href: "/a" })).not.toThrow();
    });
  });

  describe("eagerPreload", () => {
    test("queues claims until load, then preloads code at idle", () => {
      const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
      mount(eagerPreload());
      link({ href: "/a", preload: "eager" });
      link({ href: "/b", preload: "eager" });
      link({ href: "/c" });
      vi.runAllTimers();
      expect(preloaded()).toEqual([]);
      readyState.mockReturnValue("complete");
      window.dispatchEvent(new Event("load"));
      expect(preloaded()).toEqual([]);
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:false", "/b:false"]);
      readyState.mockRestore();
    });

    test("after load, later mounts preload at the next idle", () => {
      mount(eagerPreload({ all: true, data: true }));
      link({ href: "/a" });
      link({ href: "/b", preload: "false" });
      vi.runAllTimers();
      link({ href: "/c" });
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/a:true", "/c:true"]);
    });

    test("a link disposed before the flush is dropped", () => {
      mount(eagerPreload({ all: true }));
      link({ href: "/a" }).disposeLink();
      link({ href: "/b" });
      vi.runAllTimers();
      expect(preloaded()).toEqual(["/b:false"]);
    });
  });
});
