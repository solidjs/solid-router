// Server-side lazy route subtrees: SSR resolves a matched boundary and
// renders the inner routes (the placeholder's promise-valued memo defers the
// render, resolution recompiles the tree), and the single-flight collector
// resolves boundaries before its preload pass so it is not blind to inner
// route data. Boundaries are async work, so they need the streaming render
// path (renderToStringAsync is a promise wrapper over renderToStream); the
// sync renderToString is not supported with lazy subtrees.
import { renderToStringAsync } from "@solidjs/web";
import { createRouter, memoryHistory, useParams } from "../../src/index.js";
import { query } from "../../src/data/query.js";
import { createFlightDataCollector } from "../../src/server.js";
import type { RouteDefinition } from "../../src/types.js";

describe("SSR through a lazy subtree", () => {
  test("resolves the boundary and renders the inner route", async () => {
    let thunkCalls = 0;
    const Router = createRouter({
      routes: [
        {
          path: "/plugins",
          component: (props: any) => <section data-route="plugins">{props.children}</section>,
          children: () => {
            thunkCalls++;
            return Promise.resolve({
              default: [
                {
                  path: "/widgets/:id",
                  component: () => {
                    const params = useParams();
                    return <div data-route="widget">{params.id}</div>;
                  }
                }
              ]
            });
          }
        }
      ] as const,
      history: memoryHistory("/plugins/widgets/7")
    });

    const html = await renderToStringAsync(() => <Router />);
    expect(thunkCalls).toBe(1);
    expect(html).toContain('data-route="plugins"');
    expect(html).toContain('data-route="widget"');
    expect(html).toContain(">7<");
  });
});

describe("flight collector through a lazy subtree", () => {
  const getWidget = query(async (id: string) => ({ id }), "widget");

  const routes: RouteDefinition[] = [
    {
      path: "/plugins",
      children: () =>
        Promise.resolve({
          default: [
            {
              path: "/widgets/:id",
              preload: ({ params }: any) => getWidget(params.id)
            }
          ] as RouteDefinition[]
        })
    }
  ];

  test("resolves boundaries before the preload pass", async () => {
    const collect = createFlightDataCollector({ routes });
    const headers = new Headers({ referer: "http://localhost:3000/plugins/widgets/7" });
    const event = {
      request: new Request("http://localhost:3000/_server", { method: "POST", headers }),
      response: { headers: new Headers() },
      locals: {}
    };
    const outcome = {
      id: "fn#0",
      value: "mutated",
      request: event.request,
      thrown: false
    };

    const data: any = await collect(event as any, outcome as any);
    expect(Object.keys(data)).toEqual(['widget["7"]']);
    expect(await data['widget["7"]']).toEqual({ id: "7" });
  });
});
