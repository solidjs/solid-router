// #655: registration timing on the server. A cold-start POST-redirect-GET
// reads submissions on the very first render, so the flash decoder must be
// in its slot by then. Nothing here provides one by hand: the module-scope
// `action()` below installs the action layer's own (lazily imported) codec
// at import, before any request renders — the way every app's actions are
// declared.
import { createRequestEvent, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { encodeFlashCookie } from "@solidjs/web/server-functions/server";
import { action, createRouter, useSubmissions } from "../../src/index.js";

(globalThis as any).__SOLID_SECRET__ = "action-registration-cold-start-spec-secret";

const save = action(Object.assign(async () => ({ saved: "first" }), { url: "/_server/save" }));

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("server registration timing", () => {
  test("the first request's render seeds submissions from the flash cookie", async () => {
    function Status() {
      const subs = useSubmissions(save);
      return <p class="status">{subs.map(s => s.result?.saved).join(",")}</p>;
    }
    const Router = createRouter({ routes: [{ path: "/", component: Status }] });
    const cookie = (await encodeFlashCookie("/_server/save", { saved: "first" }, []))!;
    const event = createRequestEvent(
      new Request("http://localhost/", { headers: { cookie: cookie.split(";")[0] } })
    );
    const html = await provideRequestEvent(event, () =>
      Promise.race([
        renderToStream(() => <Router />).then(String),
        delay(2000).then(() => "TIMEOUT")
      ])
    );
    expect(html).toContain('class="status">first</p>');
    expect(event.response.headers.getSetCookie().filter(c => c.startsWith("flash="))).toHaveLength(
      1
    );
  });
});
