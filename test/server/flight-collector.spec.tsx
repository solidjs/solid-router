// Server-mode tests (node resolve conditions, real request-event scoping):
// the router's server integration for the server function runtime — the
// single-flight data collector. (The no-JS flash-cookie handler and the
// generic halves of collection — target resolution, X-Revalidate parsing,
// cookie folding — moved upstream; they are covered in the runtime's suite.)
import { foldSetCookies } from "@solidjs/web/server-functions/server";
import { query } from "../../src/data/query.js";
import { createFlightDataCollector } from "../../src/server.js";
import type { RouteDefinition } from "../../src/types.js";

const getNotes = query(async () => ["note-1"], "notes");
const getUser = query(async () => ({ name: "solid" }), "user");
const getUserById = query(async (id: string) => ({ id }), "userById");

const routes: RouteDefinition[] = [
  { path: "/notes", preload: () => getNotes() },
  {
    path: "/profile",
    preload: () => {
      getNotes();
      getUser();
    }
  }
];

function createEvent(referrer?: string | null) {
  const headers = new Headers();
  if (referrer !== null) headers.set("referer", referrer ?? "http://localhost:3000/notes");
  headers.set("cookie", "session=abc");
  return {
    request: new Request("http://localhost:3000/_server", { method: "POST", headers }),
    response: { headers: new Headers() },
    locals: {}
  };
}

// Mimics the runtime's outcome pre-digestion (tested upstream): the
// collector consumes `targetUrl`/`revalidateKeys`/`foldedHeaders` rather
// than deriving them from raw headers itself.
function createOutcome(event: any, response?: Response, value: unknown = "mutated") {
  const request: Request = event.request;
  let targetUrl: string | undefined;
  const referrer = request.headers.get("referer");
  if (referrer) {
    const location = response?.headers.get("Location");
    const target = location ? new URL(location, request.url) : new URL(referrer);
    if (target.origin === new URL(request.url).origin) targetUrl = target.toString();
  }
  return {
    id: "fn#0",
    value,
    response,
    request,
    thrown: false,
    targetUrl,
    revalidateKeys: response?.headers.get("X-Revalidate")?.split(","),
    foldedHeaders: foldSetCookies(request.headers, [
      ...(event.response?.headers?.getSetCookie() ?? []),
      ...(response?.headers?.getSetCookie() ?? [])
    ])
  };
}

describe("createFlightDataCollector (preload runner)", () => {
  const collect = createFlightDataCollector({ routes });

  test("requires a route tree", () => {
    expect(() => createFlightDataCollector({} as any)).toThrow(/routes/);
  });

  test("collects the referring page's route data", async () => {
    const event = createEvent();
    const data: any = await collect(event as any, createOutcome(event) as any);
    expect(Object.keys(data)).toEqual(["notes[]"]);
    expect(await data["notes[]"]).toEqual(["note-1"]);
  });

  test("filters collection to X-Revalidate keys on the same page", async () => {
    const event = createEvent("http://localhost:3000/profile");
    const response = new Response(null, { headers: { "X-Revalidate": "user" } });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    expect(Object.keys(data)).toEqual(['user[]']);
    expect(await data["user[]"]).toEqual({ name: "solid" });
  });

  test("collects everything for routes newly entered via redirect", async () => {
    const event = createEvent("http://localhost:3000/notes");
    const response = new Response(null, {
      headers: { Location: "/profile", "X-Revalidate": "user" }
    });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    // the destination route was not previously matched, so the key filter
    // gives way to full collection — its queries have no client cache yet
    expect(Object.keys(data).sort()).toEqual(["notes[]", "user[]"]);
  });

  test("produces nothing without a referrer", async () => {
    const event = createEvent(null);
    expect(await collect(event as any, createOutcome(event) as any)).toBeUndefined();
  });

  test("produces nothing for redirects leaving the app", async () => {
    const event = createEvent();
    const response = new Response(null, { headers: { Location: "https://external.example/x" } });
    expect(await collect(event as any, createOutcome(event, response) as any)).toBeUndefined();
  });

  test("produces nothing for unmatched target urls", async () => {
    const event = createEvent("http://localhost:3000/not-routed");
    expect(await collect(event as any, createOutcome(event) as any)).toBeUndefined();
  });

  test("the collection pass runs on the outcome's folded cookie state", async () => {
    const { getRequestEvent } = await import("@solidjs/web");
    const seen: (string | null | undefined)[] = [];
    const probe = createFlightDataCollector({
      routes: [
        {
          path: "/notes",
          preload: () => {
            seen.push(getRequestEvent()?.request.headers.get("cookie"));
            getNotes();
          }
        }
      ]
    });
    const event = createEvent();
    const response = new Response(null, {
      headers: { "Set-Cookie": "session=fresh; Path=/; HttpOnly" }
    });
    await probe(event as any, createOutcome(event, response) as any);
    expect(seen).toEqual(["session=fresh"]);
  });
});

describe("createFlightDataCollector (router instance)", () => {
  test("accepts a createRouter instance: routes, base, and preload come from its config", async () => {
    const { createRouter } = await import("../../src/routers/factory.jsx");
    const rootIntents: string[] = [];
    const Router = createRouter({
      routes,
      preload: ({ intent }) => void rootIntents.push(intent)
    });
    const collect = createFlightDataCollector(Router);
    const event = createEvent();
    const data: any = await collect(event as any, createOutcome(event) as any);
    expect(Object.keys(data)).toEqual(["notes[]"]);
    expect(await data["notes[]"]).toEqual(["note-1"]);
    expect(rootIntents).toEqual(["initial"]);
  });
});

describe("createFlightDataCollector (nested trees and thunks)", () => {
  const nestedRoutes: RouteDefinition[] = [
    { path: "/notes", preload: () => getNotes() },
    {
      path: "/users",
      children: [{ path: "/:id", preload: ({ params }) => getUserById(params.id!) }]
    }
  ];

  test("matches nested route trees and runs their preloads", async () => {
    const collect = createFlightDataCollector({ routes: nestedRoutes });
    const event = createEvent("http://localhost:3000/users/7");
    const data: any = await collect(event as any, createOutcome(event) as any);
    expect(Object.keys(data)).toEqual(['userById["7"]']);
    expect(await data['userById["7"]']).toEqual({ id: "7" });
  });

  test("accepts a thunk producing the tree (lazily built)", async () => {
    const collect = createFlightDataCollector({ routes: () => nestedRoutes });
    const event = createEvent("http://localhost:3000/notes");
    const data: any = await collect(event as any, createOutcome(event) as any);
    expect(Object.keys(data)).toEqual(["notes[]"]);
  });
});

describe("createFlightDataCollector (root preload)", () => {
  const getRootData = query(async () => "root", "rootData");

  test("runs before route preloads with merged params and initial intent", async () => {
    const rootArgs: any[] = [];
    const collect = createFlightDataCollector({
      routes: {
        path: "/users",
        children: [{ path: "/:id", preload: ({ params }) => getUserById(params.id!) }]
      },
      rootPreload: args => {
        rootArgs.push(args);
        getRootData();
      }
    });
    const event = createEvent("http://localhost:3000/users/7");
    const data: any = await collect(event as any, createOutcome(event) as any);
    expect(rootArgs).toHaveLength(1);
    expect(rootArgs[0].intent).toBe("initial");
    expect(rootArgs[0].params).toEqual({ id: "7" });
    expect(rootArgs[0].location.pathname).toBe("/users/7");
    expect(Object.keys(data).sort()).toEqual(["rootData[]", 'userById["7"]']);
    expect(await data["rootData[]"]).toBe("root");
  });

  test("its queries honor the X-Revalidate filter on the same page", async () => {
    const collect = createFlightDataCollector({
      routes,
      rootPreload: () => {
        getRootData();
      }
    });
    const event = createEvent("http://localhost:3000/notes");
    const response = new Response(null, { headers: { "X-Revalidate": "notes" } });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    // the root's query was not named for revalidation — same-page collection
    // stays scoped to the keys the mutation invalidated
    expect(Object.keys(data)).toEqual(["notes[]"]);
  });
});