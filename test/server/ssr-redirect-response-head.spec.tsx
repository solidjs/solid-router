import {
  createRequestEvent,
  createSSRResponse,
  httpStatus,
  redirect,
  renderToStream,
  renderToString
} from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { query } from "../../src/data/query.js";
import { createRouter, useNavigate } from "../../src/index.js";

function Guard() {
  useNavigate()("/login");
  return <p>guarded</p>;
}

describe("an SSR redirect writes into the response head", () => {
  test("headers already on the head are kept", async () => {
    const Router = createRouter({
      routes: [
        { path: "/account", component: Guard },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = createRequestEvent(new Request("http://localhost/account"));
    event.response.headers.append("Set-Cookie", "session=abc; Path=/");
    await provideRequestEvent(event, () => renderToString(() => <Router />));
    expect(event.response.status).toBe(302);
    expect(event.response.headers.get("Location")).toBe("/login");
    expect(event.response.headers.getSetCookie()).toEqual(["session=abc; Path=/"]);
  });

  test("a status text declared earlier does not carry over", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/account",
          component: () => {
            httpStatus(404, "Not Found");
            return <Guard />;
          }
        },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = createRequestEvent(new Request("http://localhost/account"));
    await provideRequestEvent(event, () => renderToString(() => <Router />));
    expect(event.response.status).toBe(302);
    expect(event.response.statusText).toBeUndefined();
  });

  test("an event without a response head gets one", async () => {
    const Router = createRouter({
      routes: [
        { path: "/account", component: Guard },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = { request: new Request("http://localhost/account"), locals: {} } as any;
    await provideRequestEvent(event, () => renderToString(() => <Router />));
    expect(event.response.status).toBe(302);
    expect(event.response.headers.get("Location")).toBe("/login");
  });

  test("a committed head is left alone", async () => {
    const Router = createRouter({
      routes: [
        { path: "/account", component: Guard },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = createRequestEvent(new Request("http://localhost/account"));
    event.response.status = 200;
    event.response.committed = true;
    await provideRequestEvent(event, () => renderToString(() => <Router />));
    expect(event.response.status).toBe(200);
    expect(event.response.headers.has("Location")).toBe(false);
  });

  test("a redirect from a lazy subtree reaches the handler's response", async () => {
    const Router = createRouter({
      routes: [
        {
          path: "/plugins",
          children: () => Promise.resolve({ default: [{ path: "/account", component: Guard }] })
        },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = createRequestEvent(new Request("http://localhost/plugins/account"));
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream(() => <Router />),
        event
      )
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });

  test("a query redirect resolves its Location against the router base", async () => {
    const getAccount = query(async () => redirect("/login"), "account");
    const Router = createRouter({
      base: "/app",
      routes: [
        { path: "/account", preload: () => getAccount(), component: () => <p>account</p> },
        { path: "/login", component: () => <p>login</p> }
      ]
    });
    const event = createRequestEvent(new Request("http://localhost/app/account"));
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream(() => <Router />),
        event
      )
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/login");
  });
});
