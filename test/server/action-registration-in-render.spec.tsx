// #655: registration timing on the server, worst case. No action exists when
// the router is created for the first request: the only one is created
// inside a route component during that render. Its creation installs the
// flash decoder before its own `useSubmissions` can read, so the seeding read
// still finds the request's outcome. Nothing else in this file creates an
// action, and the router-only render runs first, before any exists.
import { createRequestEvent, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { encodeFlashCookie } from "@solidjs/web/server-functions/server";
import { action, createRouter, useSubmissions } from "../../src/index.js";

(globalThis as any).__SOLID_SECRET__ = "action-registration-in-render-spec-secret";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("server registration timing", () => {
  test("before any action exists, a render with a flash cookie clears it and renders", async () => {
    const Router = createRouter({ routes: [{ path: "/", component: () => <main>page</main> }] });
    const cookie = (await encodeFlashCookie("/_server/save", { saved: "unread" }, []))!;
    const event = createRequestEvent(
      new Request("http://localhost/", { headers: { cookie: cookie.split(";")[0] } })
    );
    const html = await provideRequestEvent(event, () =>
      renderToStream(() => <Router />).then(String)
    );
    expect(html).toMatch(/<main[^>]*>page<\/main>/);
    expect(event.response.headers.getSetCookie().filter(c => c.startsWith("flash="))).toHaveLength(
      1
    );
  });

  test("an action created during the first render still seeds from the flash cookie", async () => {
    function Status() {
      const save = action(
        Object.assign(async () => ({ saved: "in-render" }), { url: "/_server/save" })
      );
      const subs = useSubmissions(save);
      return <p class="status">{subs.map(s => s.result?.saved).join(",")}</p>;
    }
    const Router = createRouter({ routes: [{ path: "/", component: Status }] });
    const cookie = (await encodeFlashCookie("/_server/save", { saved: "in-render" }, []))!;
    const event = createRequestEvent(
      new Request("http://localhost/", { headers: { cookie: cookie.split(";")[0] } })
    );
    const html = await provideRequestEvent(event, () =>
      Promise.race([
        renderToStream(() => <Router />).then(String),
        delay(2000).then(() => "TIMEOUT")
      ])
    );
    expect(html).toContain('class="status">in-render</p>');
  });
});
