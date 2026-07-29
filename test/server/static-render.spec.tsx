// Server rendering outside a request event (SSG scripts, tests): the
// provider's `url` prop supplies the location, so one module-scope router
// instance (and one compiled route tree) serves every URL.
import { renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter, useLocation } from "../../src/index.js";

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

  test("the url prop provides the location", async () => {
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router url="/users/7?tab=posts" />);
    expect(html).toContain('data-route="user"');
    expect(html).toContain("/users/7?tab=posts");
  });

  test("a full URL works and its origin is ignored", async () => {
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router url="https://example.com/users/9?tab=likes" />);
    expect(html).toContain('data-route="user"');
    expect(html).toContain("/users/9?tab=likes");
  });

  test("one instance renders different URLs across renders", async () => {
    const Router = createRouter({ routes });
    expect(await renderToString(() => <Router url="/users/1" />)).toContain('data-route="user"');
    expect(await renderToString(() => <Router url="/" />)).toContain('data-route="home"');
  });

  test("a request event takes precedence over the url prop", async () => {
    const Router = createRouter({ routes });
    const html = await provideRequestEvent(
      {
        request: new Request("http://localhost:3000/users/3?tab=posts"),
        response: { headers: new Headers() },
        locals: {}
      },
      () => renderToString(() => <Router url="/users/999" />)
    );
    expect(html).toContain("/users/3?tab=posts");
  });

  test("defaults to the root with no url and no event", async () => {
    // Rendering event-less after `provideRequestEvent` has registered the
    // async-context store is exactly the state the runtime's "RequestEvent
    // is missing" warning fires on — expected here, so swallow it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const Router = createRouter({ routes });
      const html = await renderToString(() => <Router />);
      expect(html).toContain('data-route="home"');
    } finally {
      warn.mockRestore();
    }
  });
});
