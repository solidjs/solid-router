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

// The fold semantics for redirects that stay under a shared parent layout:
// which segments of the destination match re-run their queries is decided
// entirely by the outcome's revalidateKeys (audited 2026-08-11). Keyless
// means revalidate-everything — the deliberate default since #407 — while
// explicit keys scope retained segments to the named entries, with newly
// entered segments always collecting fully past the filter (the client has
// no cache for them yet).
describe("createFlightDataCollector (shared-parent fold)", () => {
  const executions: Record<string, number> = {};
  const counted = <T,>(name: string, value: T) =>
    query(async () => {
      executions[name] = (executions[name] ?? 0) + 1;
      return value;
    }, name);

  const getLayout = counted("layoutData", "layout");
  const getStats = counted("statsData", "stats");
  const getA = counted("aData", "a");
  const getB = counted("bData", "b");

  // /dash is the segment ABOVE the fold for a /dash/a -> /dash/b redirect
  const collect = createFlightDataCollector({
    routes: {
      path: "/dash",
      preload: () => {
        getLayout();
        getStats();
      },
      children: [
        { path: "/a", preload: () => getA() },
        { path: "/b", preload: () => getB() }
      ]
    }
  });

  beforeEach(() => {
    for (const key in executions) delete executions[key];
  });

  test("keyless redirects re-run retained parent segments (the revalidate-all default)", async () => {
    const event = createEvent("http://localhost:3000/dash/a");
    const response = new Response(null, { headers: { Location: "/dash/b" } });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    // no X-Revalidate header = actions' invalidate-everything default: the
    // shared parent's queries re-run and ride the payload alongside the new
    // segment's (the departing leaf /dash/a is not part of the destination
    // match, so its query does not run)
    expect(Object.keys(data).sort()).toEqual(["bData[]", "layoutData[]", "statsData[]"]);
    expect(executions).toEqual({ layoutData: 1, statsData: 1, bData: 1 });
  });

  test("revalidate: [] skips retained parents but still collects newly entered segments", async () => {
    const event = createEvent("http://localhost:3000/dash/a");
    // redirect(url, { revalidate: [] }) encodes as an empty X-Revalidate
    // header, which digests to [""] — a filter matching no key
    const response = new Response(null, {
      headers: { Location: "/dash/b", "X-Revalidate": "" }
    });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    // client-nav mimicry: nothing above the fold re-runs; only the segment
    // the redirect newly enters fetches and flies
    expect(Object.keys(data)).toEqual(["bData[]"]);
    expect(executions).toEqual({ bData: 1 });
  });

  test("explicit keys re-run their entries AND newly entered segments collect fully", async () => {
    const event = createEvent("http://localhost:3000/dash/a");
    const response = new Response(null, {
      headers: { Location: "/dash/b", "X-Revalidate": "statsData" }
    });
    const data: any = await collect(event as any, createOutcome(event, response) as any);
    // the union: the named key re-runs on the retained parent (its sibling
    // layoutData does not), and the newly entered segment's unnamed query
    // still collects past the filter — explicit invalidation layers new
    // fetches on top rather than replacing them or refetching everything
    expect(Object.keys(data).sort()).toEqual(["bData[]", "statsData[]"]);
    expect(executions).toEqual({ statsData: 1, bData: 1 });
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