// @vitest-environment jsdom
import { createResource, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { MemoryRouter, Route, createMemoryHistory, useNavigate } from "../src/index.jsx";
import type { Navigator } from "../src/types.js";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("pending navigation", () => {
  test("navigating back to the shown route cancels a pending navigation", async () => {
    let resolveSlow!: (value: string) => void;
    const Slow = () => {
      const [value] = createResource(() => new Promise<string>(resolve => (resolveSlow = resolve)));
      return <span>Slow {value()}</span>;
    };
    let navigate!: Navigator;
    const history = createMemoryHistory();
    history.set({ value: "/a", scroll: false });
    const root = document.createElement("div");
    const dispose = render(
      () => (
        <MemoryRouter
          history={history}
          root={props => {
            navigate = useNavigate();
            return (
              <>
                <p id="location">{props.location.pathname}</p>
                <Suspense fallback={<span>Loading</span>}>{props.children}</Suspense>
              </>
            );
          }}
        >
          <Route path="/" component={() => <span>Home</span>} />
          <Route path="/a" component={() => <span>Page A</span>} />
          <Route path="/slow" component={Slow} />
        </MemoryRouter>
      ),
      root
    );

    try {
      await wait(10);
      expect(root.textContent).toContain("Page A");
      navigate("/slow");
      await wait(10);
      expect(root.textContent).toContain("Page A");
      navigate("/a");
      await wait(10);
      resolveSlow("loaded");
      await wait(25);
      expect(history.get()).toBe("/a");
      expect(root.querySelector("#location")?.textContent).toBe("/a");
      expect(root.textContent).toContain("Page A");
      expect(root.textContent).not.toContain("Slow");

      // no duplicate /a entry was pushed
      history.back();
      await wait(10);
      expect(history.get()).toBe("/");
    } finally {
      dispose();
    }
  });
});
