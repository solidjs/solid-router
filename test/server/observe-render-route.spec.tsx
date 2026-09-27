// Observe tier, server: the router declares the route a render resolved to
// with the same `OBSERVE.attribution.withOrigin` call the client makes at its
// initial match, and the request's `"render"` record carries it as
// `RenderEvent.route` — the name a consumer gives the request (`http.route`)
// where the URL would scatter one page across as many names as it has
// parameters. There is no attribution engine on the server; the declaration
// is the whole of what the call does there.
import { OBSERVE } from "solid-js";
import { renderToStream, renderToString } from "@solidjs/web";
import type { RenderEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter, defineRoutes, useParams } from "../../src/index.js";

const unsubscribes: Array<() => void> = [];
afterEach(() => {
  for (const off of unsubscribes.splice(0)) off();
});

function renders(): RenderEvent[] {
  const seen: RenderEvent[] = [];
  unsubscribes.push(OBSERVE!.records.subscribe("render", event => seen.push(event)));
  return seen;
}

describe("observe tier, server: RenderEvent.route from the router's initial match", () => {
  const routes = [
    { path: "/", component: () => <div data-route="home">Home</div> },
    {
      path: "/users/:id",
      component: () => {
        const params = useParams();
        return <div data-route="user">{params.id}</div>;
      }
    }
  ] as const;

  test("the url prop's route names the render", async () => {
    const seen = renders();
    const Router = createRouter({ routes });
    const html = await renderToString(() => <Router url="/users/7?tab=posts" />);
    expect(html).toContain('data-route="user"');
    expect(seen).toHaveLength(1);
    expect(seen[0].route).toEqual({
      name: "/users/:id",
      to: "/users/7?tab=posts",
      params: { id: "7" }
    });
  });

  test("the root route is named '/'", async () => {
    const seen = renders();
    const Router = createRouter({ routes });
    await renderToString(() => <Router url="/" />);
    expect(seen[0].route).toMatchObject({ name: "/", to: "/" });
  });

  test("a request event's URL is the route the render resolved to", async () => {
    const seen = renders();
    const Router = createRouter({ routes });
    await provideRequestEvent(
      {
        request: new Request("http://localhost:3000/users/3"),
        response: { headers: new Headers() },
        locals: {}
      },
      () => renderToString(() => <Router url="/users/999" />)
    );
    expect(seen[0].route).toEqual({ name: "/users/:id", to: "/users/3", params: { id: "3" } });
  });

  test("a lazy subtree that resolved during the render names the exact route", async () => {
    const seen = renders();
    const pluginRoutes = defineRoutes([
      {
        path: "/widgets/:id",
        component: () => {
          const params = useParams();
          return <div data-route="widget">{params.id}</div>;
        }
      }
    ]);
    const Router = createRouter({
      routes: [
        { path: "/", component: () => <div data-route="home">Home</div> },
        {
          path: "/plugins",
          component: (props: any) => <section data-route="plugins">{props.children}</section>,
          children: () => Promise.resolve({ default: pluginRoutes })
        }
      ] as const
    });
    // Lazy subtrees need the async path; awaiting the stream resolves with the settled HTML.
    const html = await renderToStream(() => <Router url="/plugins/widgets/7" />);
    expect(html).toContain('data-route="widget"');
    // The ref is read when the render settles — after the table loaded.
    expect(seen[0].route).toEqual({
      name: "/plugins/widgets/:id",
      to: "/plugins/widgets/7",
      params: { id: "7" }
    });
  });

  test("a render without a router has no route", async () => {
    const seen = renders();
    await renderToString(() => <main>plain</main>);
    expect(seen).toHaveLength(1);
    expect(seen[0].route).toBeUndefined();
  });
});
