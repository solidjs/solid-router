// @vitest-environment jsdom
/**
 * #655: a router app that never calls `action()`. The action layer installs
 * itself into the router's seams on the first `action()` (data/action.ts,
 * `installRouterIntegrations`); importing the package — `useSubmissions` and
 * `useAction` included — installs nothing. Until something installs it, the
 * core's delegation is the defined behavior for form submits: client-only
 * action urls submit natively (their module is the only thing that could run
 * them), posts to server-function urls are intercepted synchronously and run
 * through the action module loaded lazily. The registration is module-global,
 * so this file must never create an action before the tests that rely on its
 * absence; tests run in order.
 */
import { vi } from "vitest";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory, useAction, useSubmissions } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function mount() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const Page = () => (
    <>
      <form method="post" action="https://action/client-only">
        <button type="submit">client</button>
      </form>
      <form method="post" action="/_server/echo%230">
        <input name="text" value="hello" />
        <button type="submit">server</button>
      </form>
    </>
  );
  const Router = createRouter({
    routes: [{ path: "/", component: Page }] as const,
    history: memoryHistory("/")
  });
  const unmount = render(() => <Router />, root);
  const forms = root.querySelectorAll("form");
  return {
    clientForm: forms[0],
    serverForm: forms[1],
    dispose: () => {
      unmount();
      root.remove();
    }
  };
}

/** Dispatches a submit like the browser does; `true` when it was not prevented. */
const submitsNatively = (form: HTMLFormElement) =>
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

let originalFetch: typeof fetch;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  originalFetch = global.fetch;
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  global.fetch = fetchMock as any;
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("a router app without action()", () => {
  test("importing useSubmissions and useAction installs nothing", async () => {
    // module evaluation is not registration: both are exported from the
    // action module, and neither creates an action — so a server-function
    // post still reaches the core's fallback, not an installed handler
    expect(typeof useSubmissions).toBe("function");
    expect(typeof useAction).toBe("function");
    const submitServerForm = vi.fn();
    vi.doMock("../src/data/serverForms.js", () => ({ submitServerForm }));
    const t = mount();
    expect(submitsNatively(t.serverForm)).toBe(false);
    await vi.waitFor(() => expect(submitServerForm).toHaveBeenCalledTimes(1));
    expect(submitServerForm.mock.calls[0][1]).toBe("/_server/echo%230");
    vi.doUnmock("../src/data/serverForms.js");
    t.dispose();
  });

  test("client-only action urls submit natively", () => {
    const t = mount();
    expect(submitsNatively(t.clientForm)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    t.dispose();
  });

  test("a server-function form is intercepted and runs through the lazily loaded action module", async () => {
    const t = mount();
    expect(submitsNatively(t.serverForm)).toBe(false);
    // no handler was installed: busy state waits for the module to load
    expect(t.serverForm.getAttribute("aria-busy")).toBeNull();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/_server/data/echo%230");
    await vi.waitFor(() => expect(t.serverForm.getAttribute("aria-busy")).toBeNull());

    // the loaded module installed its handler: the next submit is the
    // action layer's from the first synchronous tick
    expect(submitsNatively(t.serverForm)).toBe(false);
    expect(t.serverForm.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(t.serverForm.getAttribute("aria-busy")).toBeNull());
    t.dispose();
  });

  test("client-only urls with no registered action still submit natively once the layer is installed", async () => {
    // the same treatment the installed handler gives a registry miss, so the
    // early-submit behavior and the installed behavior agree
    const t = mount();
    expect(submitsNatively(t.clientForm)).toBe(true);
    await wait(10);
    expect(fetchMock).not.toHaveBeenCalled();
    t.dispose();
  });
});
