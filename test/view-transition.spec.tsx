/**
 * Opt-in View Transitions API. The browser must snapshot the page that is
 * still on screen, and the update callback must not resolve until a held
 * navigation has revealed. History is written once, inside that callback.
 * Scroll restoration scrolls the destination, not the page being snapshotted.
 */
import { render } from "@solidjs/web";
import { createMemo } from "solid-js";
import { vi } from "vitest";
import { createRouter, memoryHistory, useNavigate, type Navigator } from "../src/index.js";

const originalScrollTo = window.scrollTo;

beforeEach(() => {
  window.scrollTo = vi.fn();
  window.history.replaceState(null, "", "/");
  window.history.scrollRestoration = "auto";
  sessionStorage.clear();
});

afterEach(() => {
  window.scrollTo = originalScrollTo;
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  vi.unstubAllGlobals();
});

type StartArg =
  | (() => void | Promise<void>)
  | { update: () => void | Promise<void>; types?: string[] };

type Start = (arg: StartArg) => { updateCallbackDone: Promise<void> };

function install(div: HTMLElement) {
  const seen: { at: "before" | "after"; text: string; types?: string[] }[] = [];
  let pending: Promise<void> = Promise.resolve();
  const start = vi.fn<Start>(arg => {
    const update = typeof arg === "function" ? arg : arg.update;
    const types = typeof arg === "function" ? undefined : arg.types;
    const done = new Promise<void>((resolve, reject) => {
      queueMicrotask(() => {
        seen.push({ at: "before", text: div.textContent || "", types });
        Promise.resolve()
          .then(update)
          .then(() => {
            seen.push({ at: "after", text: div.textContent || "", types });
            resolve();
          }, reject);
      });
    });
    pending = done;
    return { updateCallbackDone: done, finished: done, ready: done, skipTransition() {} };
  });
  (document as unknown as { startViewTransition: Start }).startViewTransition = start;
  return {
    seen,
    start,
    /** The router's snapshot is scheduled on a microtask; the mock takes another. */
    done: async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await pending;
    }
  };
}

function click(div: HTMLElement, selector: string) {
  const link = div.querySelector(selector)!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, "composedPath", {
    value: () => [link, div, document.body, document, window]
  });
  link.dispatchEvent(event);
}

describe("view transitions", () => {
  test("stay off unless asked, and a snapshot sees the old page then the new one", async () => {
    let navigate!: Navigator;
    const routes = [
      {
        path: "/",
        component: () => {
          navigate = useNavigate();
          return <div>home</div>;
        }
      },
      { path: "/a", component: () => <div>a</div> }
    ] as const;
    const div = document.createElement("div");
    document.body.appendChild(div);
    const history = memoryHistory();
    const Off = createRouter({ routes, history });
    let dispose = render(() => <Off />, div);
    const off = install(div);
    try {
      navigate("/a");
      await off.done();
      expect(off.start).not.toHaveBeenCalled();
      expect(div.textContent).toBe("a");
    } finally {
      dispose();
      div.remove();
    }

    const next = document.createElement("div");
    document.body.appendChild(next);
    let go!: Navigator;
    const On = createRouter({
      viewTransition: true,
      history: memoryHistory(),
      routes: [
        {
          path: "/",
          component: () => {
            go = useNavigate();
            return <div>home</div>;
          }
        },
        { path: "/a", component: () => <div>a</div> }
      ] as const
    });
    dispose = render(() => <On />, next);
    const on = install(next);
    try {
      go("/a");
      await on.done();
      expect(on.seen.map(entry => entry.at + ":" + entry.text)).toEqual(["before:home", "after:a"]);
      expect(on.start).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
      next.remove();
    }
  });

  test("same-tick navigations share one transition and one history entry", async () => {
    let navigate!: Navigator;
    const history = memoryHistory();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const Router = createRouter({
      viewTransition: true,
      history,
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div>home</div>;
          }
        },
        { path: "/a", component: () => <div>a</div> },
        { path: "/b", component: () => <div>b</div> }
      ] as const
    });
    const dispose = render(() => <Router />, div);
    const vt = install(div);
    const set = vi.spyOn(history, "set");
    try {
      navigate("/a");
      navigate("/b");
      await vt.done();
      expect(vt.start).toHaveBeenCalledTimes(1);
      expect(div.textContent).toBe("b");
      expect(set).toHaveBeenCalledTimes(1);
      expect(history.get()).toBe("/b");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("an anchor attribute opts in with types, and noviewtransition opts out of the default", async () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const div = document.createElement("div");
    document.body.appendChild(div);
    const Router = createRouter({
      history: memoryHistory(),
      routes: [
        {
          path: "/",
          component: () => (
            <>
              <a href="/a" ref={el => el.setAttribute("viewtransition", "slide-left")}>
                A
              </a>
              <div>home</div>
            </>
          )
        },
        { path: "/a", component: () => <div>a</div> }
      ] as const
    });
    let dispose = render(() => <Router />, div);
    const vt = install(div);
    try {
      click(div, 'a[href="/a"]');
      await vt.done();
      expect(vt.seen).toEqual([
        { at: "before", text: "Ahome", types: ["slide-left"] },
        { at: "after", text: "a", types: ["slide-left"] }
      ]);
    } finally {
      dispose();
      div.remove();
    }

    const div2 = document.createElement("div");
    document.body.appendChild(div2);
    const DefaultOn = createRouter({
      viewTransition: true,
      history: memoryHistory(),
      routes: [
        {
          path: "/",
          component: () => (
            <>
              <a href="/b" ref={el => el.setAttribute("noviewtransition", "")}>
                B
              </a>
              <div>home</div>
            </>
          )
        },
        { path: "/b", component: () => <div>b</div> }
      ] as const
    });
    dispose = render(() => <DefaultOn />, div2);
    const vt2 = install(div2);
    try {
      click(div2, 'a[href="/b"]');
      await vt2.done();
      expect(vt2.start).not.toHaveBeenCalled();
      expect(div2.textContent).toBe("b");
    } finally {
      dispose();
      div2.remove();
    }
  });

  test("holds the old page inside the callback until a route without a fallback resolves", async () => {
    let navigate!: Navigator;
    let release!: (value: string) => void;
    let gate = new Promise<string>(resolve => {
      release = resolve;
    });
    const div = document.createElement("div");
    document.body.appendChild(div);
    const history = memoryHistory();
    const Router = createRouter({
      viewTransition: true,
      history,
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div>home</div>;
          }
        },
        {
          path: "/slow",
          component: () => {
            const value = createMemo(async () => gate);
            return <div>{value()}</div>;
          }
        }
      ] as const
    });
    const dispose = render(() => <Router />, div);
    const vt = install(div);
    try {
      navigate("/slow");
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(vt.seen.map(entry => entry.at)).toEqual(["before"]);
      expect(vt.seen[0].text).toBe("home");
      expect(div.textContent).toBe("home");
      release("slow");
      await vt.done();
      expect(vt.seen.at(-1)).toMatchObject({ at: "after", text: "slow" });
      expect(history.get()).toBe("/slow");
    } finally {
      dispose();
      div.remove();
    }
  });

  test("restores scroll on the destination inside the callback, without a second history entry on back", async () => {
    let y = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
    window.scrollTo = vi.fn((_x: number, next: number) => {
      y = next;
      window.dispatchEvent(new Event("scroll"));
    }) as any;

    let navigate!: Navigator;
    const div = document.createElement("div");
    document.body.appendChild(div);
    const Router = createRouter({
      viewTransition: true,
      routes: [
        {
          path: "/",
          component: () => {
            navigate = useNavigate();
            return <div>long</div>;
          }
        },
        { path: "/short", component: () => <div>short</div> }
      ] as const
    });
    const dispose = render(() => <Router />, div);
    const vt = install(div);
    const length = window.history.length;
    try {
      y = 3000;
      window.dispatchEvent(new Event("scroll"));
      navigate("/short");
      await vt.done();
      expect(div.textContent).toBe("short");
      expect(window.history.length).toBe(length + 1);

      window.history.back();
      await vi.waitFor(() => expect(div.textContent).toBe("long"));
      expect(window.history.length).toBe(length + 1);
      expect(window.scrollTo).toHaveBeenCalledWith(0, 3000);
      expect(vt.seen.some(entry => entry.at === "before" && entry.text === "short")).toBe(true);
    } finally {
      dispose();
      div.remove();
    }
  });
});
