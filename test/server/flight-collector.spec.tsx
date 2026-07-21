// Server-mode tests (node resolve conditions, real request-event scoping):
// the router's server integration for the server function runtime — the
// single-flight data collector, its cookie-forwarding headers, and the
// no-JS flash-cookie handler.
import { query } from "../../src/data/query.js";
import {
  createFlightDataCollector,
  createNoJSHandler,
  createSingleFlightHeaders
} from "../../src/server.js";
import { decodeFlashCookie } from "../../src/data/flash.js";
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

function createOutcome(event: any, response?: Response, value: unknown = "mutated") {
  return { id: "fn#0", value, response, request: event.request, thrown: false };
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

describe("createSingleFlightHeaders", () => {
  test("returns copied headers untouched without response cookies", () => {
    const event = createEvent();
    const headers = createSingleFlightHeaders(event);
    expect(headers).not.toBe(event.request.headers);
    expect(headers.get("cookie")).toBe("session=abc");
  });

  test("folds Set-Cookie mutations into the cookie header", () => {
    const event = createEvent();
    event.response.headers.append("Set-Cookie", "session=next; Path=/; HttpOnly");
    event.response.headers.append("Set-Cookie", "theme=dark");
    const headers = createSingleFlightHeaders(event);
    expect(headers.get("cookie")).toBe("session=next; theme=dark");
    // the source request stays untouched
    expect(event.request.headers.get("cookie")).toBe("session=abc");
  });

  test("honors deletions via Max-Age and Expires", () => {
    const event = createEvent();
    event.response.headers.append("Set-Cookie", "session=; Max-Age=0");
    event.response.headers.append(
      "Set-Cookie",
      `stale=1; Expires=${new Date(Date.now() - 1000).toUTCString()}`
    );
    const headers = createSingleFlightHeaders(event);
    expect(headers.get("cookie")).toBeNull();
  });
});

describe("createNoJSHandler", () => {
  const handleNoJS = createNoJSHandler();

  function formRequest(referrer = "http://localhost:3000/notes") {
    return new Request("http://localhost:3000/_server?id=createNote", {
      method: "POST",
      headers: { referer: referrer },
      body: "title=hello"
    });
  }

  test("redirects back with the outcome in a flash cookie", () => {
    const form = new FormData();
    form.set("title", "hello");
    const response = handleNoJS({ id: 1 }, formRequest(), [form]);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/notes");
    const submission = decodeFlashCookie(response.headers.get("Set-Cookie"))!;
    expect(submission.url).toBe("/_server?id=createNote");
    expect(submission.result).toEqual({ id: 1 });
    expect(submission.input[0]).toBeInstanceOf(FormData);
    expect(submission.input[0].get("title")).toBe("hello");
  });

  test("flashes thrown errors onto the submission's error", () => {
    const response = handleNoJS(new Error("denied"), formRequest(), [], true);
    expect(response.status).toBe(303);
    const submission = decodeFlashCookie(response.headers.get("Set-Cookie"))!;
    expect(submission.error).toBeInstanceOf(Error);
    expect(submission.error.message).toBe("denied");
  });

  test("follows redirect results, resolving relative locations", () => {
    const redirect = new Response(null, { status: 302, headers: { Location: "/dashboard" } });
    const response = handleNoJS(redirect, formRequest(), []);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    // the redirect carries its meaning in its metadata — no flash cookie
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  test("falls back to the referrer for responses without a location", () => {
    const reload = new Response(null, { headers: { "X-Revalidate": "notes" } });
    const response = handleNoJS(reload, formRequest(), []);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/notes");
  });
});
