// @vitest-environment jsdom
import { createSignal, Show, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { MemoryRouter, Route, createMemoryHistory, useNavigate } from "../src/index.js";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function captureUnhandled() {
  const errors: any[] = [];
  const onUnhandled = (reason: unknown) => {
    errors.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  process.on("uncaughtException", onUnhandled);
  return {
    errors,
    stop: () => {
      process.off("unhandledRejection", onUnhandled);
      process.off("uncaughtException", onUnhandled);
    }
  };
}

describe("Routes disposal (#451)", () => {
  test("navigating to an unmatched URL does not crash mounted route contexts", async () => {
    const capture = captureUnhandled();
    const history = createMemoryHistory();
    history.set({ value: "/a/b" });
    let nav!: ReturnType<typeof useNavigate>;
    const Layout = (props: ParentProps) => {
      nav = useNavigate();
      return <div>layout{props.children}</div>;
    };
    const root = document.createElement("div");
    const dispose = render(
      () => (
        <MemoryRouter history={history}>
          <Route path="/a" component={Layout}>
            <Route path="/b" component={() => <span>b</span>} />
          </Route>
        </MemoryRouter>
      ),
      root
    );
    await wait(10);
    expect(root.innerHTML).toContain("b");

    nav("/nowhere", { scroll: false });
    await wait(50);

    dispose();
    capture.stop();
    expect(capture.errors).toEqual([]);
  });

  test("route roots are disposed when the route tree unmounts", async () => {
    const capture = captureUnhandled();
    const history = createMemoryHistory();
    history.set({ value: "/a/b" });
    let nav!: ReturnType<typeof useNavigate>;
    const [show, setShow] = createSignal(true);
    const Layout = (props: ParentProps) => {
      nav = useNavigate();
      return <div>layout{props.children}</div>;
    };
    const root = document.createElement("div");
    const dispose = render(
      () => (
        <MemoryRouter
          history={history}
          root={props => <Show when={show()}>{props.children}</Show>}
        >
          <Route path="/a" component={Layout}>
            <Route path="/b" component={() => <span>b</span>} />
          </Route>
          <Route path="/login" component={() => <span>login</span>} />
        </MemoryRouter>
      ),
      root
    );
    await wait(10);
    expect(root.innerHTML).toContain("b");

    // hide the route tree — without cleanup this leaks zombie route roots that
    // stay subscribed to matches() and crash on the next navigation
    setShow(false);
    await wait(10);
    nav("/nowhere", { scroll: false });
    await wait(50);

    dispose();
    capture.stop();
    expect(capture.errors).toEqual([]);
  });
});
