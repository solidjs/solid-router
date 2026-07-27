import { render } from "solid-js/web";
import { vi } from "vitest";
import { Router, Route, useNavigate } from "../src/index.js";
import type { Navigator } from "../src/index.js";

// jsdom implements history traversal but not scrolling — stub the primitives
// so the restoration path (capture on scroll, restore via scrollTo) is
// observable.
function stubScrolling() {
  let y = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
  const scrollTo = vi.fn((_x: number, newY: number) => {
    y = newY;
    window.dispatchEvent(new Event("scroll"));
  });
  window.scrollTo = scrollTo as any;
  return {
    scrollTo,
    scrollUserTo(newY: number) {
      y = newY;
      window.dispatchEvent(new Event("scroll"));
    }
  };
}

describe("scroll restoration (#577)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  test("is off by default", () => {
    window.history.scrollRestoration = "auto";
    const dispose = render(
      () => (
        <Router>
          <Route path="/" component={() => null} />
        </Router>
      ),
      document.body
    );
    try {
      expect(window.history.scrollRestoration).toBe("auto");
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("restores the saved position on back navigation", async () => {
    const scrolling = stubScrolling();
    let navigate!: Navigator;

    const Long = () => {
      navigate = useNavigate();
      return <div data-testid="long">long</div>;
    };

    const dispose = render(
      () => (
        <Router scrollRestoration>
          <Route path="/" component={Long} />
          <Route path="/short" component={() => <div data-testid="short">short</div>} />
        </Router>
      ),
      document.body
    );

    try {
      expect(window.history.scrollRestoration).toBe("manual");

      // user scrolls down the long page, then navigates away
      scrolling.scrollUserTo(3000);
      navigate("/short");
      await vi.waitFor(() => expect(document.querySelector("[data-testid=short]")).toBeTruthy());
      // push navigations still scroll to the top
      expect(scrolling.scrollTo).toHaveBeenLastCalledWith(0, 0);

      window.history.back();
      await vi.waitFor(() => expect(document.querySelector("[data-testid=long]")).toBeTruthy());
      await vi.waitFor(() => expect(scrolling.scrollTo).toHaveBeenLastCalledWith(0, 3000));
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });

  test("a push prunes saved positions for truncated forward entries", async () => {
    const scrolling = stubScrolling();
    let navigate!: Navigator;

    const Page = () => {
      navigate = useNavigate();
      return <div data-testid="page">page</div>;
    };

    const dispose = render(
      () => (
        <Router scrollRestoration>
          <Route path="/" component={Page} />
          <Route path="/a" component={Page} />
          <Route path="/b" component={Page} />
        </Router>
      ),
      document.body
    );

    try {
      navigate("/a");
      await vi.waitFor(() => expect(window.location.pathname).toBe("/a"));
      scrolling.scrollUserTo(500);

      window.history.back();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/"));

      // pushing /b truncates the forward entry (/a at the same depth) — its
      // saved position must not leak into the fresh /b entry
      navigate("/b");
      await vi.waitFor(() => expect(window.location.pathname).toBe("/b"));
      scrolling.scrollTo.mockClear();

      window.history.back();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
      window.history.forward();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/b"));
      await Promise.resolve();
      expect(scrolling.scrollTo).not.toHaveBeenCalledWith(0, 500);
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
});
