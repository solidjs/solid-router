import { render } from "@solidjs/web";
import { vi } from "vitest";
import { createRouter, useIsRouting } from "../src/index.js";
import type { RouteDefinition } from "../src/types.js";

// Every write is a transition in Solid 2, so isRouting must report native
// history traversals (popstate), not just programmatic navigation.
describe("isRouting on native traversals", () => {
  test("flips during a popstate navigation that parks on a lazy subtree", async () => {
    let resolveTable!: (m: { default: RouteDefinition[] }) => void;
    const table = new Promise<{ default: RouteDefinition[] }>(r => (resolveTable = r));

    let isRouting!: () => boolean;
    const Home = () => {
      isRouting = useIsRouting();
      return <div data-testid="home">home</div>;
    };

    const Router = createRouter({
      routes: [
        { path: "/", component: Home },
        {
          path: "/lazy",
          component: (props: any) => <section data-testid="shell">{props.children}</section>,
          children: () => table
        }
      ] as const,
      scrollRestoration: false
    });

    window.history.replaceState(null, "", "/");
    const dispose = render(() => <Router />, document.body);

    try {
      expect(isRouting()).toBe(false);

      // a browser-initiated traversal: no router API involved
      window.history.pushState(null, "", "/lazy");
      window.dispatchEvent(new PopStateEvent("popstate"));

      await vi.waitFor(() => expect(isRouting()).toBe(true));

      resolveTable({
        default: [{ path: "/", component: () => <div data-testid="lazy">lazy</div> }]
      });

      await vi.waitFor(() => expect(document.querySelector("[data-testid=lazy]")).toBeTruthy());
      expect(isRouting()).toBe(false);
    } finally {
      document.body.innerHTML = "";
      dispose();
    }
  });
});
