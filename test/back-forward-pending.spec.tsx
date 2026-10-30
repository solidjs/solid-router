// @vitest-environment jsdom
import { createResource, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { MemoryRouter, Route, createMemoryHistory } from "../src/index.jsx";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("pending browser history navigation", () => {
  test("Forward replaces a pending Back transition to a slow route", async () => {
    let resolveSlow!: (value: string) => void;
    let slowStarted = 0;
    const Slow = () => {
      const [value] = createResource(() => {
        slowStarted++;
        return new Promise<string>(resolve => {
          resolveSlow = resolve;
        });
      });
      return <span>Slow {value()}</span>;
    };
    const history = createMemoryHistory();
    history.set({ value: "/", scroll: false });
    history.set({ value: "/slow", scroll: false });
    history.set({ value: "/fast", scroll: false });
    const root = document.createElement("div");
    const dispose = render(
      () => (
        <MemoryRouter
          history={history}
          root={props => (
            <>
              <p id="location">{props.location.pathname}</p>
              <Suspense fallback={<span>Loading</span>}>{props.children}</Suspense>
            </>
          )}
        >
          <Route path="/" component={() => <span>Home</span>} />
          <Route path="/slow" component={Slow} />
          <Route path="/fast" component={() => <span>Fast</span>} />
        </MemoryRouter>
      ),
      root
    );

    try {
      await wait(10);
      expect(root.textContent).toContain("Fast");
      history.back();
      await wait(10);
      expect(slowStarted).toBe(1);
      history.forward();
      await wait(10);
      resolveSlow("loaded");
      await wait(25);
      expect(history.get()).toBe("/fast");
      expect(root.querySelector("#location")?.textContent).toBe("/fast");
      expect(root.textContent).toContain("Fast");
    } finally {
      dispose();
    }
  });
});
