// The flash decode belongs to the request, not to a router instance. A
// server render may re-create the router: a suspension under <Errored>
// escalates to the nearest retryable hole, and when that hole sits above the
// router (a document shell's `{props.children}`) the retry renders a new one.
// A decode cached on the instance restarted with every new router, so the
// seeding read never settled and the stream retried forever.
import { Errored, Loading } from "solid-js";
import type { JSX } from "solid-js";
import { createRequestEvent, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { decodeFlashCookie, encodeFlashCookie } from "@solidjs/web/server-functions/server";
import { action, useSubmissions } from "../../src/data/action.js";
import { provideFlashDecoder } from "../../src/routing.js";
import { createRouter } from "../../src/index.js";

(globalThis as any).__SOLID_SECRET__ = "flash-decode-per-request-spec-secret";

// first provide wins: installed before any action installs the default codec
let decodes = 0;
provideFlashDecoder(cookieHeader => {
  decodes++;
  return decodeFlashCookie(cookieHeader);
});

const save = action(
  Object.assign(async () => ({ error: "Failed to save" }), { url: "/_server/save" })
);

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("flash decode per request", () => {
  test("a document render that re-creates the router settles with the flash outcome", async () => {
    let routerRenders = 0;
    const Router = createRouter({ routes: [{ path: "/", component: () => <main>page</main> }] });
    function Status() {
      const subs = useSubmissions(save);
      return <p class="status">{subs.find(s => s.result?.error)?.result?.error}</p>;
    }
    function Document(props: { children?: JSX.Element }) {
      return (
        <html>
          <head />
          <body>{props.children}</body>
        </html>
      );
    }

    const cookie = (await encodeFlashCookie("/_server/save", { error: "Failed to save" }, []))!;
    const event = createRequestEvent(
      new Request("http://localhost/", { headers: { cookie: cookie.split(";")[0] } })
    );
    const html = await provideRequestEvent(event, () =>
      Promise.race([
        renderToStream(() => (
          <Document>
            <Router>
              {props => {
                routerRenders++;
                return (
                  <Errored fallback={() => <p>failed</p>}>
                    <Status />
                    <Loading fallback={<p>loading</p>}>{props.children}</Loading>
                  </Errored>
                );
              }}
            </Router>
          </Document>
        )).then(String),
        delay(2000).then(() => "TIMEOUT")
      ])
    );

    expect(html).toContain('class="status">Failed to save</p>');
    // the retry did render a new router; the request still decoded once and
    // cleared the cookie once
    expect(routerRenders).toBeGreaterThan(1);
    expect(decodes).toBe(1);
    expect(event.response.headers.getSetCookie().filter(c => c.startsWith("flash="))).toHaveLength(
      1
    );
  });
});
