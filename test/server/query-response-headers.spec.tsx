import { createMemo, Errored } from "solid-js";
import { vi } from "vitest";
import {
  createRequestEvent,
  createSSRResponse,
  httpStatus,
  redirect,
  renderToStream,
  respond
} from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { query } from "../../src/data/query.js";
import { createRouter } from "../../src/index.js";

describe.each(["returned", "thrown"] as const)(
  "%s query response headers on the server",
  outcome => {
    test.each(["respond", "Response"] as const)(
      "%s preserves document headers, cookies and query metadata",
      async kind => {
        const value = { message: "query result" };
        const result = kind === "respond" ? respond(value) : new Response("query body");
        const response = result instanceof Response ? result : result.response!;
        response.headers.set("Content-Type", "application/json");
        response.headers.set("Content-Length", "42");
        response.headers.set("Content-Encoding", "br");
        response.headers.set("Transfer-Encoding", "chunked");
        const representationHeaders = {
          "Content-Disposition": 'attachment; filename="query.json"',
          "Content-Language": "en",
          "Content-Location": "/api/query",
          "Content-Range": "bytes 0-41/100",
          "Accept-Ranges": "bytes",
          ETag: '"query-v1"',
          "Last-Modified": "Mon, 28 Sep 2026 10:00:00 GMT"
        };
        for (const [name, value] of Object.entries(representationHeaders)) {
          response.headers.set(name, value);
        }
        response.headers.append("Set-Cookie", "first=1; Path=/; HttpOnly");
        response.headers.append("Set-Cookie", "second=2; Path=/; HttpOnly");
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Query", "metadata");
        const originalHeaders = [...response.headers];
        const event = createRequestEvent(new Request("http://localhost/"));
        event.response.headers.set("Content-Type", "text/html; charset=utf-8");
        event.response.headers.set("Set-Cookie", "existing=1; Path=/");
        const read = query(async () => {
          if (outcome === "thrown") throw result;
          return result;
        }, "response-headers");

        await provideRequestEvent(event, async () => {
          const expected = kind === "respond" ? value : response;
          if (outcome === "thrown") await expect(read()).rejects.toBe(expected);
          else await expect(read()).resolves.toBe(expected);
        });

        expect(event.response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
        for (const name of [
          "Content-Length",
          "Content-Encoding",
          "Transfer-Encoding",
          ...Object.keys(representationHeaders)
        ]) {
          expect(event.response.headers.has(name)).toBe(false);
        }
        expect(event.response.headers.getSetCookie()).toEqual([
          "existing=1; Path=/",
          "first=1; Path=/; HttpOnly",
          "second=2; Path=/; HttpOnly"
        ]);
        expect(event.response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(event.response.headers.get("X-Query")).toBe("metadata");
        expect([...response.headers]).toEqual(originalHeaders);
        expect(response.bodyUsed).toBe(false);
      }
    );

    test("keeps the final SSR document's HTML content type", async () => {
      const event = createRequestEvent(new Request("http://localhost/"));
      const read = query(async () => {
        const headers = { "Content-Disposition": 'attachment; filename="query.json"' };
        if (outcome === "thrown") throw respond({ message: "conflict" }, { status: 409, headers });
        return respond({ message: "accepted" }, { status: 202, headers });
      }, "ssr-document");
      const Router = createRouter({
        routes: [
          {
            path: "/",
            component: () => {
              const data = createMemo(() => read());
              return <p>{data().message}</p>;
            }
          }
        ]
      });
      function Failed() {
        httpStatus(500);
        return <p>failed</p>;
      }

      const response = await provideRequestEvent(event, async () => {
        const html = await renderToStream(() => (
          <Errored fallback={() => <Failed />}>
            <Router>{props => props.children}</Router>
          </Errored>
        ));
        return createSSRResponse(html, event);
      });

      expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
      expect(response.headers.has("Content-Disposition")).toBe(false);
      expect(response.status).toBe(outcome === "thrown" ? 500 : 200);
      expect(await response.text()).toContain(outcome === "thrown" ? "failed" : "accepted");
    });

    test("preserves redirects and their cookies", async () => {
      const event = createRequestEvent(new Request("http://localhost/"));
      const read = query(async () => {
        const response = redirect("/destination", {
          headers: { "Set-Cookie": "session=fresh; Path=/; HttpOnly" }
        });
        if (outcome === "thrown") throw response;
        return response;
      }, "redirect-headers");

      await provideRequestEvent(event, async () => {
        expect(await read()).toBeUndefined();
      });

      expect(event.response.status).toBe(302);
      expect(event.response.headers.get("Location")).toBe("/destination");
      expect(event.response.headers.getSetCookie()).toEqual(["session=fresh; Path=/; HttpOnly"]);
    });

    test("a cached envelope does not write body headers after the response is committed", async () => {
      const event = createRequestEvent(new Request("http://localhost/"));
      const value = { message: "query result" };
      const read = query(async () => {
        const result = respond(value);
        if (outcome === "thrown") throw result;
        return result;
      }, "cached-response-headers");

      await provideRequestEvent(event, async () => {
        if (outcome === "thrown") await expect(read()).rejects.toBe(value);
        else await expect(read()).resolves.toBe(value);
        const response = createSSRResponse("<p>shell</p>", event);
        expect(event.response.committed).toBe(true);
        const set = vi.spyOn(event.response.headers, "set");
        const append = vi.spyOn(event.response.headers, "append");

        if (outcome === "thrown") await expect(read()).rejects.toBe(value);
        else await expect(read()).resolves.toBe(value);

        expect(set).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
        expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
      });
    });

    test("preserves the late redirect fallback after the streaming shell is sent", async () => {
      const event = createRequestEvent(new Request("http://localhost/"));
      const read = query(async () => {
        const response = redirect("/destination");
        if (outcome === "thrown") throw response;
        return response;
      }, "late-redirect");

      await provideRequestEvent(event, async () => {
        let end!: () => void;
        const response = await createSSRResponse(
          {
            pipe(writable) {
              writable.write("<p>shell</p>");
              end = () => writable.end();
            }
          },
          event
        );
        expect(event.response.committed).toBe(true);
        expect(await read()).toBeUndefined();
        end();

        expect(response.status).toBe(200);
        expect(response.headers.has("Location")).toBe(false);
        expect(await response.text()).toContain('<script>window.location="/destination"</script>');
      });
    });
  }
);

test("a synchronous query leaves the document's existing body headers intact", async () => {
  const event = createRequestEvent(new Request("http://localhost/"));
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": "1024",
    "Content-Encoding": "gzip",
    "Transfer-Encoding": "chunked",
    "Content-Disposition": "inline",
    "Content-Language": "pt-BR",
    "Content-Location": "/document",
    "Content-Range": "bytes 0-1023/2048",
    "Accept-Ranges": "none",
    ETag: '"document-v1"',
    "Last-Modified": "Tue, 29 Sep 2026 10:00:00 GMT"
  };
  for (const [name, value] of Object.entries(headers)) event.response.headers.set(name, value);
  const response = new Response("query body", {
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "10",
      "Content-Encoding": "br",
      "Transfer-Encoding": "identity",
      "Content-Disposition": 'attachment; filename="query.txt"',
      "Content-Language": "en",
      "Content-Location": "/api/query",
      "Content-Range": "bytes 0-9/100",
      "Accept-Ranges": "bytes",
      ETag: '"query-v1"',
      "Last-Modified": "Mon, 28 Sep 2026 10:00:00 GMT"
    }
  });
  const read = query(() => response, "sync-response-headers");

  await provideRequestEvent(event, async () => {
    expect(await read()).toBe(response);
  });

  expect([...event.response.headers]).toEqual([...new Headers(headers)]);
});
