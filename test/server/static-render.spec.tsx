// Server rendering outside a request event (SSG scripts, tests): the static
// integration falls back to the configured history adapter for the location,
// so `memoryHistory("/page")` picks the rendered route isomorphically.
import { renderToString } from "@solidjs/web";
import { createRouter, memoryHistory, useLocation } from "../../src/index.js";

describe("static render without a request event", () => {
  const routes = [
    { path: "/", component: () => <div data-route="home">Home</div> },
    {
      path: "/users/:id",
      component: () => {
        const location = useLocation();
        return <div data-route="user">{location.pathname + location.search}</div>;
      }
    }
  ] as const;

  test("memoryHistory provides the location", async () => {
    const Router = createRouter({ routes, history: memoryHistory("/users/7?tab=posts") });
    const html = await renderToString(() => <Router />);
    expect(html).toContain('data-route="user"');
    expect(html).toContain("/users/7?tab=posts");
  });

  test("defaults to the root with no history and no event", async () => {
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router />);
    expect(html).toContain('data-route="home"');
  });
});
