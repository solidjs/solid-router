import { render } from "@solidjs/web";
import { vi } from "vitest";
import { A, MemoryRouter, Route } from "../src/index.js";

describe("Client navigation should", () => {
  test("update rendered routes after clicking links", async () => {
    const originalScrollTo = window.scrollTo;
    window.scrollTo = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);

    const dispose = render(
      () => (
        <MemoryRouter>
          <Route
            path="/"
            component={() => (
              <>
                <A href="/about">About</A>
                <div data-route="home">Home page</div>
              </>
            )}
          />
          <Route path="/about" component={() => <div data-route="about">About page</div>} />
        </MemoryRouter>
      ),
      div
    );

    try {
      expect(div.querySelector('[data-route="home"]')?.textContent).toBe("Home page");
      expect(div.querySelector('[data-route="about"]')).toBeNull();

      const link = div.querySelector("a");
      expect(link).toBeTruthy();

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0
      });
      Object.defineProperty(event, "composedPath", {
        value: () => [link!, div, document.body, document, window]
      });

      link!.dispatchEvent(event);
      await new Promise<void>(resolve => queueMicrotask(() => resolve()));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(div.querySelector('[data-route="about"]')?.textContent).toBe("About page");
      expect(div.querySelector('[data-route="home"]')).toBeNull();
    } finally {
      dispose();
      div.remove();
      window.scrollTo = originalScrollTo;
    }
  });
});
