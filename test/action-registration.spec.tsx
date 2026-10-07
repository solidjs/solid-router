// @vitest-environment jsdom
/**
 * #655: registration timing on the client. The action layer installs into
 * the router's seams on the first `action()` — at import for the usual
 * module-scope action — whether or not a router is already mounted: a
 * code-split route's module loading after mount attaches to the live router.
 * A submit before that module loaded meets the core's delegation, which
 * leaves a client-only url to the browser. Nothing in this file creates an
 * action before the module import; tests run in order.
 */
import { vi } from "vitest";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory, useSubmissions, type Action } from "../src/index.js";

let lateAction: Action<[FormData], string> | undefined;
let lateCalls: string[] = [];

function mount() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const Status = () => {
    const subs = useSubmissions(lateAction!);
    return <output>{subs.map(s => s.result).join(",")}</output>;
  };
  const Page = () => (
    <form method="post" action="https://action/late">
      <input name="text" value="hello" />
      <button type="submit">save</button>
    </form>
  );
  const Router = createRouter({
    routes: [{ path: "/", component: Page }] as const,
    history: memoryHistory("/")
  });
  const unmount = render(
    () => (
      <Router>
        {props => (
          <>
            {props.children}
            {lateAction && <Status />}
          </>
        )}
      </Router>
    ),
    root
  );
  return {
    root,
    form: root.querySelector("form")!,
    dispose: () => {
      unmount();
      root.remove();
    }
  };
}

const submitsNatively = (form: HTMLFormElement) =>
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

describe("action registration timing", () => {
  test("a submit before the action's module loaded is left to the browser", () => {
    const t = mount();
    expect(submitsNatively(t.form)).toBe(true);
    t.dispose();
  });

  test("an action module loaded after the router mounted takes over its forms", async () => {
    const t = mount();
    const mod = await import("./fixtures/late-action.js");
    lateAction = mod.late;
    lateCalls = mod.calls;
    expect(String(lateAction)).toBe("https://action/late");

    // the already-mounted router's delegation now reaches the installed handler
    expect(submitsNatively(t.form)).toBe(false);
    expect(t.form.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(() => expect(lateCalls).toEqual(["hello"]));
    await vi.waitFor(() => expect(t.form.getAttribute("aria-busy")).toBeNull());
    t.dispose();
  });

  test("submissions recorded through the late action render via useSubmissions", async () => {
    const t = mount();
    expect(submitsNatively(t.form)).toBe(false);
    await vi.waitFor(() => expect(t.root.querySelector("output")!.textContent).toBe("saved"));
    t.dispose();
  });
});
