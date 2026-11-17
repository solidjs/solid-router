// #724: a no-JS round trip lands on a GET carrying the flash cookie. The
// browser has no runtime to swap out-of-order <template> chunks in, so the
// flash outcome must render inline in the shell — the decode (WebCrypto,
// async) holds the shell instead of suspending the route under a fallback.
import { For, Loading, createMemo } from "solid-js";
import { createRequestEvent, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { decodeFlashCookie, encodeFlashCookie } from "@solidjs/web/server-functions/server";
import { formAction, useSubmissions } from "../../src/data/action.js";
import { provideFlashDecoder } from "../../src/routing.js";
import { createRouter, query } from "../../src/index.js";

const getTodos = query(async () => ["first"], "todos-inline");

(globalThis as any).__SOLID_SECRET__ = "flash-no-js-inline-spec-secret";

const save = formAction(
  Object.assign(
    async () => {
      throw new Error("unused");
    },
    { url: "/_server/save-inline" }
  )
);

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// The decode is WebCrypto: its latency is the platform's, not a microtask.
// A few timer turns is enough to outlast the stream's shell drain.
provideFlashDecoder(async cookieHeader => {
  await delay(30);
  return decodeFlashCookie(cookieHeader);
});

describe("no-JS flash outcome renders inline (#724)", () => {
  test("a submissions read under the root Loading is in the shell, not a streamed template", async () => {
    function Page() {
      const subs = useSubmissions(save);
      const list = createMemo(() => getTodos());
      return (
        <main>
          <ul>
            <For each={list()}>{t => <li>{t}</li>}</For>
          </ul>
          <form method="post" action={save}>
            <input name="title" />
          </form>
          <p class="err">{(subs.at(-1)?.error as any)?.issues?.title}</p>
        </main>
      );
    }
    const Router = createRouter({ routes: [{ path: "/", component: Page }] });

    const cookie = (await encodeFlashCookie(
      "/_server/save-inline",
      { issues: { title: "Too short" } },
      [],
      true
    ))!;
    const event = createRequestEvent(
      new Request("http://localhost/", { headers: { cookie: cookie.split(";")[0] } })
    );
    // pipe, not `.then(String)`: awaiting the whole stream renders every
    // boundary inline, which hides exactly what a no-JS browser is sent first
    const shell = await provideRequestEvent(
      event,
      () =>
        new Promise<string>(resolve => {
          renderToStream(() => (
            <html>
              <head />
              <body>
                <Router>
                  {props => (
                    <Loading fallback={<p class="fallback">loading</p>}>{props.children}</Loading>
                  )}
                </Router>
              </body>
            </html>
          )).pipe({
            write(chunk: string) {
              resolve(String(chunk));
            },
            end() {}
          });
        })
    );
    const html = shell;
    expect(html).not.toContain('class="fallback"');
    expect(html).toContain("<form");
    expect(html).toContain('class="err">Too short</p>');
  });
});
