// Server-mode tests: the SSR flash-seeding path through createRouterContext.
// The core consumes the flash cookie eagerly at context creation (detection
// + one-shot clear via flashCookie.ts, so the Set-Cookie precedes any
// streaming flush) and defers decoding to the codec the action side
// provides (provideFlashDecoder), read when the lazily allocated
// submissions signal first initializes. Fresh module instances per test —
// the decoder slot is module-global and first-provide-wins.
import { createRoot, createSignal } from "solid-js";
import { vi } from "vitest";
import { provideRequestEvent } from "@solidjs/web/storage";
import { encodeFlashCookie } from "../../src/data/flash.js";

// encodeFlashCookie produces a Set-Cookie value; requests carry just the
// name=value pair in their Cookie header
const flashCookieHeader = (result: any, input: any[] = []) =>
  encodeFlashCookie("/_server?id=createNote", result, input).split(";")[0];

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

describe("SSR flash seeding", () => {
  test("clears the cookie eagerly and seeds submissions through the provided decoder", async () => {
    const routing = await loadRouting();
    const { decodeFlashCookie } = await import("../../src/data/flash.js");
    const event = createEvent(flashCookieHeader({ id: 1 }));

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      // the one-shot clear is appended at context creation, before anything
      // (or nothing) ever reads submissions
      expect(event.response.headers.get("Set-Cookie")).toContain("Max-Age=0");

      routing.provideFlashDecoder(decodeFlashCookie);
      const seeded = router.submissions[0]();
      expect(seeded).toHaveLength(1);
      expect(seeded[0].url).toBe("/_server?id=createNote");
      expect(seeded[0].result).toEqual({ id: 1 });
    });
  });

  test("clears the cookie even when no decoder was ever provided", async () => {
    const routing = await loadRouting();
    const event = createEvent(flashCookieHeader("saved"));

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      expect(event.response.headers.get("Set-Cookie")).toContain("Max-Age=0");
      expect(router.submissions[0]()).toEqual([]);
    });
  });

  test("a pre-seeded event.router.submission takes precedence and leaves the cookie alone", async () => {
    const routing = await loadRouting();
    const { decodeFlashCookie } = await import("../../src/data/flash.js");
    const submission = { url: "/x", input: [], result: "pre-seeded" };
    const event = createEvent(flashCookieHeader("ignored"), { submission });

    await provideRequestEvent(event, async () => {
      const router = createContext(routing);
      expect(event.response.headers.get("Set-Cookie")).toBeNull();

      routing.provideFlashDecoder(decodeFlashCookie);
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
});
