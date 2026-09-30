import { createRequestEvent, createSSRResponse, respond } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { vi } from "vitest";
import { query } from "../../src/data/query.js";

describe.each(["returned", "thrown"] as const)("%s query response cookies", outcome => {
  test.each(["respond", "Response"] as const)(
    "%s appends cookies once across concurrent and cached reads",
    async kind => {
      const value = { message: "query result" };
      const result = kind === "respond" ? respond(value) : new Response("query body");
      const response = result instanceof Response ? result : result.response!;
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Query", "metadata");
      const cookies = [
        "session=first; Path=/; HttpOnly",
        "session=second; Path=/; HttpOnly",
        "prefs=light; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/"
      ];
      for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
      const fn = vi.fn(async () => {
        if (outcome === "thrown") throw result;
        return result;
      });
      const read = query(fn, "cached-cookies");
      const event = createRequestEvent(new Request("http://localhost/"));
      event.response.headers.append("Set-Cookie", "existing=1; Path=/");

      await provideRequestEvent(event, async () => {
        const results = await Promise.allSettled([read(), read()]);
        results.push(...(await Promise.allSettled([read()])));
        for (const settled of results) {
          expect(settled.status).toBe(outcome === "thrown" ? "rejected" : "fulfilled");
          const actual = settled.status === "fulfilled" ? settled.value : settled.reason;
          expect(actual).toBe(kind === "respond" ? value : response);
        }
        expect(fn).toHaveBeenCalledTimes(1);
        expect(event.response.headers.getSetCookie()).toEqual(["existing=1; Path=/", ...cookies]);
        expect(response.headers.getSetCookie()).toEqual(cookies);

        createSSRResponse("<p>done</p>", event);
        const append = vi.spyOn(event.response.headers, "append");
        const set = vi.spyOn(event.response.headers, "set");
        const [settled] = await Promise.allSettled([read()]);
        const expected = kind === "respond" ? value : response;
        expect(settled).toEqual(
          outcome === "thrown"
            ? { status: "rejected", reason: expected }
            : { status: "fulfilled", value: expected }
        );
        expect(append).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
      });
    }
  );
});

test("new query results can set a cookie back to an earlier value", async () => {
  const event = createRequestEvent(new Request("http://localhost/"));
  const first = query(
    () => respond("first", { headers: { "Set-Cookie": "session=first; Path=/" } }),
    "first-cookie"
  );
  const second = query(
    () => respond("second", { headers: { "Set-Cookie": "session=second; Path=/" } }),
    "second-cookie"
  );

  await provideRequestEvent(event, async () => {
    await first();
    await second();
    await first();
    expect(event.response.headers.getSetCookie()).toEqual([
      "session=first; Path=/",
      "session=second; Path=/"
    ]);

    query.delete(first.keyFor());
    await first();
    expect(event.response.headers.getSetCookie()).toEqual([
      "session=first; Path=/",
      "session=second; Path=/",
      "session=first; Path=/"
    ]);
  });
});

test("a shared response still sets its cookies in separate requests", async () => {
  const result = respond("shared", { headers: { "Set-Cookie": "session=shared; Path=/" } });
  const read = query(() => result, "shared-response");
  const events = [
    createRequestEvent(new Request("http://localhost/first")),
    createRequestEvent(new Request("http://localhost/second"))
  ];

  await Promise.all(
    events.map(event => provideRequestEvent(event, () => Promise.all([read(), read()])))
  );

  for (const event of events) {
    expect(event.response.headers.getSetCookie()).toEqual(["session=shared; Path=/"]);
  }
});

test.each(["refetch", "another query", "query.set"])(
  "%s can reuse a Response to set a cookie again",
  async mode => {
    const event = createRequestEvent(new Request("http://localhost/"));
    const result = respond("first", { headers: { "Set-Cookie": "session=first; Path=/" } });
    const first = query(() => result, "reused-response");
    const second = query(
      () => respond("second", { headers: { "Set-Cookie": "session=second; Path=/" } }),
      "intervening-cookie"
    );

    await provideRequestEvent(event, async () => {
      await first();
      await second();
      if (mode === "refetch") query.delete(first.keyFor());
      if (mode === "query.set") query.set(first.keyFor(), result);
      const next = mode === "another query" ? query(() => result, "other-query") : first;
      await next();
      await next();

      expect(event.response.headers.getSetCookie()).toEqual([
        "session=first; Path=/",
        "session=second; Path=/",
        "session=first; Path=/"
      ]);
    });
  }
);

test("a seeded cache forwards cookies on its first read", async () => {
  const event = createRequestEvent(new Request("http://localhost/"));
  const result = respond("seeded", { headers: { "Set-Cookie": "session=seeded; Path=/" } });
  const fn = vi.fn(() => result);
  const read = query(fn, "seeded-cookies");

  await provideRequestEvent(event, async () => {
    query.set(read.keyFor(), result);
    await read();
    await read();
    expect(fn).not.toHaveBeenCalled();
    expect(event.response.headers.getSetCookie()).toEqual(["session=seeded; Path=/"]);
  });
});

test("replacing the cache while a read is pending keeps each result's cookies separate", async () => {
  const event = createRequestEvent(new Request("http://localhost/"));
  const old = respond("old", { headers: { "Set-Cookie": "old=1; Path=/" } });
  const fresh = respond("fresh", { headers: { "Set-Cookie": "fresh=1; Path=/" } });
  let resolve!: (value: typeof old) => void;
  const pending = new Promise<typeof old>(r => (resolve = r));
  const read = query(() => pending, "pending-cookies");

  await provideRequestEvent(event, async () => {
    const first = read();
    query.set(read.keyFor(), fresh);
    expect(await read()).toBe("fresh");
    resolve(old);
    expect(await first).toBe("old");
    expect(await read()).toBe("fresh");
    expect(event.response.headers.getSetCookie()).toEqual(["fresh=1; Path=/", "old=1; Path=/"]);
  });
});
