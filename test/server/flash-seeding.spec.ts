// Server-mode tests: the SSR flash-seeding path through createRouterContext.
// The core consumes the flash cookie eagerly at context creation (detection
// + one-shot clear via the runtime's isomorphic half, so the Set-Cookie
// precedes any streaming flush) and defers decoding to the codec the action
// side provides (provideFlashDecoder), read when the lazily allocated
// submissions signal first initializes. The decoder is async — the cookie is
// encrypted (solidjs/solid#3239) — so the seeding read parks on the
// not-ready protocol until the decode settles. Fresh module instances per
// test — the decoder slot is module-global and first-provide-wins.
import { createRoot, createSignal, NotReadyError } from "solid-js";
import { vi } from "vitest";
import { provideRequestEvent } from "@solidjs/web/storage";
import { decodeFlashCookie, encodeFlashCookie } from "@solidjs/web/server-functions/server";

// The encrypted codec resolves its key from the deployment secret; the
// bundler-injected global is the zero-config vehicle. (Inert under a
// pre-encryption @solidjs/web, required from 2.0.0-rc.7.)
(globalThis as any).__SOLID_SECRET__ = "flash-seeding-spec-secret";

// The runtime decoder, in the async shape the slot requires. (The wrapper
// also absorbs a pre-encryption sync decodeFlashCookie, so this spec runs
// against either runtime while the rc.7 dep bump is in flight.)
const asyncDecodeFlashCookie = async (cookieHeader: string | null) =>
  decodeFlashCookie(cookieHeader);

// encodeFlashCookie produces a Set-Cookie value; requests carry just the
// name=value pair in their Cookie header
const flashCookieHeader = async (result: any, input: any[] = []) =>
  (await encodeFlashCookie("/_server?id=createNote", result, input))!.split(";")[0];

function createEvent(cookie?: string, routerInit?: any) {
  return {
    request: new Request("http://localhost:3000/notes", {
      headers: cookie ? { cookie } : undefined
    }),
    response: { headers: new Headers() },
    router: routerInit,
    locals: {}
  } as any;
}

async function loadRouting() {
  vi.resetModules();
  return await import("../../src/routing.js");
}

function createContext(routing: Awaited<ReturnType<typeof loadRouting>>) {
  return createRoot(() => {
    const signal = createSignal({ value: "/notes" });
    return routing.createRouterContext({ signal }, () => []);
  });
}

// The seeding read under the async decoder: the first read parks on the
// in-flight decode (NotReadyError carrying its promise); the resumed read
// finds the settled outcome.
async function readSeeded(router: { submissions: [() => any, any] }) {
  try {
    return router.submissions[0]();
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
    await (error as unknown as { source: Promise<void> }).source;
    return router.submissions[0]();
  }
}

describe("SSR flash seeding", () => {
  test("clears the cookie eagerly and seeds submissions through the provided decoder", async () => {
    const routing = await loadRouting();
    const event = createEvent(await flashCookieHeader({ id: 1 }));

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      // the one-shot clear is appended at context creation, before anything
      // (or nothing) ever reads submissions
      expect(event.response.headers.get("Set-Cookie")).toContain("Max-Age=0");

      routing.provideFlashDecoder(asyncDecodeFlashCookie);
      const seeded = await readSeeded(router);
      expect(seeded).toHaveLength(1);
      expect(seeded[0].url).toBe("/_server?id=createNote");
      expect(seeded[0].result).toEqual({ id: 1 });
    });
  });

  test("clears the cookie even when no decoder was ever provided", async () => {
    const routing = await loadRouting();
    const event = createEvent(await flashCookieHeader("saved"));

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      expect(event.response.headers.get("Set-Cookie")).toContain("Max-Age=0");
      expect(router.submissions[0]()).toEqual([]);
    });
  });

  test("a pre-seeded event.router.submission takes precedence and leaves the cookie alone", async () => {
    const routing = await loadRouting();
    const submission = { url: "/x", input: [], result: "pre-seeded" };
    const event = createEvent(await flashCookieHeader("ignored"), { submission });

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      expect(event.response.headers.get("Set-Cookie")).toBeNull();

      routing.provideFlashDecoder(asyncDecodeFlashCookie);
      // the pre-seed never decodes, so the read is synchronous
      const seeded = router.submissions[0]();
      expect(seeded).toHaveLength(1);
      expect(seeded[0].result).toBe("pre-seeded");
    });
  });

  test("no cookie and no pre-seed leaves submissions empty", async () => {
    const routing = await loadRouting();
    const event = createEvent();

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      expect(event.response.headers.get("Set-Cookie")).toBeNull();
      expect(router.submissions[0]()).toEqual([]);
    });
  });

  test("the decode parks the seeding read and runs exactly once", async () => {
    const routing = await loadRouting();
    const event = createEvent(await flashCookieHeader({ id: 7 }));

    let decodes = 0;
    const countingDecoder = async (cookieHeader: string | null) => {
      decodes++;
      return decodeFlashCookie(cookieHeader);
    };

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      routing.provideFlashDecoder(countingDecoder);

      // first read: the decode is in flight, the reader parks on its promise
      let parked: unknown;
      try {
        router.submissions[0]();
      } catch (error) {
        parked = error;
      }
      expect(parked).toBeInstanceOf(NotReadyError);
      await (parked as { source: Promise<void> }).source;

      // resumed read: seeded from the settled decode, which ran exactly once
      const seeded = router.submissions[0]();
      expect(seeded).toHaveLength(1);
      expect(seeded[0].url).toBe("/_server?id=createNote");
      expect(seeded[0].result).toEqual({ id: 7 });
      expect(decodes).toBe(1);
    });
  });

  test("a request whose submissions go unread never decodes", async () => {
    // lazy: the memo defers the decode to the first submissions read — a
    // request that renders without touching useSubmission never decodes.
    const routing = await loadRouting();
    const event = createEvent(await flashCookieHeader("unread"));

    let decodes = 0;
    await provideRequestEvent(event, async () => {
      routing.provideFlashDecoder(async () => {
        decodes++;
        return undefined;
      });
      const router = createContext(routing);
      // the eager half still ran: detection + one-shot clear
      expect(event.response.headers.get("Set-Cookie")).toContain("Max-Age=0");
      void router;
    });
    expect(decodes).toBe(0);
  });
});
