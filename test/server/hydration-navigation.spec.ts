// @vitest-environment node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, createServer, type Plugin, type ViteDevServer } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { vi } from "vitest";

const { JSDOM, VirtualConsole } = createRequire(import.meta.url)("jsdom");
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = ["hydration-navigation", "hydration-late-boundary"] as const;
type Fixture = (typeof fixtures)[number];
const serverEntry = (fixture: Fixture) => `${root}test/fixtures/${fixture}-server.tsx`;
const clientEntry = (fixture: Fixture) => `${root}test/fixtures/${fixture}-client.tsx`;
const PRELOAD_TIMEOUT = 5000;

// Compile each fixture for SSR and hydration without changing the posture of
// the ordinary component tests. The generated entries stay in memory.
const sources = new Map<string, string>();
for (const fixture of fixtures) {
  sources.set(
    clientEntry(fixture),
    `
      import { hydrate } from "@solidjs/web";
      import { createApp } from "./${fixture}";
      const app = createApp(globalThis.hydrationOptions);
      const dispose = hydrate(() => <app.App />, document.getElementById("app"));
      globalThis.hydrationTest = { ...app, dispose };
    `
  );
  sources.set(
    serverEntry(fixture),
    `
      import { createRequestEvent, generateHydrationScript, renderToStream } from "@solidjs/web";
      import { provideRequestEvent } from "@solidjs/web/storage";
      import { createApp } from "./${fixture}";
      export function start() {
        const event = createRequestEvent(new Request("http://localhost/"));
        return provideRequestEvent(event, () => {
          const app = createApp();
          const chunks = [];
          let resolveShell, resolveEnd;
          const shell = new Promise(resolve => resolveShell = resolve);
          const end = new Promise(resolve => resolveEnd = resolve);
          renderToStream(() => <app.App />).pipe({
            write(chunk) { chunks.push(String(chunk)); resolveShell(); },
            end() { resolveEnd(); }
          });
          return { chunks, shell, end, release: app.release, bootstrap: generateHydrationScript() };
        });
      }
    `
  );
}
const entries: Plugin = {
  name: "hydration-test-entries",
  resolveId(id) {
    if (sources.has(id)) return id;
  },
  load(id) {
    return sources.get(id);
  }
};

type Stream = {
  chunks: string[];
  shell: Promise<void>;
  end: Promise<void>;
  release: () => void;
  bootstrap: string;
};

describe("navigation during hydration", () => {
  let server: ViteDevServer;
  const apps = {} as Record<Fixture, { start: () => Stream; code: string }>;

  beforeAll(async () => {
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [entries, solidPlugin({ ssr: true, hot: false, solid: { hydratable: true } })],
      ssr: { noExternal: true, resolve: { conditions: ["node"] } },
      server: { middlewareMode: true },
      appType: "custom"
    });
    for (const fixture of fixtures) {
      const { start } = await server.ssrLoadModule(serverEntry(fixture));
      const built = await build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [entries, solidPlugin({ hot: false, dev: true, solid: { hydratable: true } })],
        resolve: { conditions: ["browser", "development"] },
        build: {
          write: false,
          minify: false,
          lib: { entry: clientEntry(fixture), name: "HydrationTest", formats: ["iife"] },
          rolldownOptions: { output: { format: "iife", codeSplitting: false } }
        }
      });
      const output = Array.isArray(built) ? built[0] : built;
      if (!("output" in output)) throw new Error("Expected an in-memory build");
      const chunk = output.output.find(file => file.type === "chunk");
      if (!chunk || chunk.type !== "chunk") throw new Error("Missing hydration entry");
      apps[fixture] = { start, code: chunk.code };
    }
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  async function setup(fixture: Fixture = "hydration-navigation", options = {}) {
    const stream = apps[fixture].start();
    await stream.shell;
    const consumed = stream.chunks.length;
    const errors: unknown[] = [];
    const fetches: string[] = [];
    const console = new VirtualConsole();
    console.on("error", (error: unknown) => errors.push(error));
    console.on("warn", (warning: unknown) => errors.push(warning));
    console.on("jsdomError", (error: unknown) => errors.push(error));
    let streaming = true;
    const dom = new JSDOM(stream.bootstrap + '<div id="app">' + stream.chunks.join("") + "</div>", {
      url: "http://localhost/",
      runScripts: "dangerously",
      virtualConsole: console,
      beforeParse(window: Window) {
        // The real document stays open until the stream ends. JSDOM would
        // otherwise announce a truncated stream after parsing just its shell.
        window.document.addEventListener(
          "DOMContentLoaded",
          event => streaming && event.stopImmediatePropagation(),
          true
        );
        Object.assign(window, {
          hydrationOptions: options,
          scrollTo: () => {},
          // Counts the requests the page makes itself: inside a hydration
          // tracking run core swaps `fetch` for a stub that never settles.
          fetch: (url: string) => (
            fetches.push(String(url)), Promise.resolve(new Response("User ready"))
          ),
          Request,
          Response,
          Headers,
          TextEncoder,
          TextDecoder,
          ReadableStream,
          TransformStream
        });
      }
    });
    const { window } = dom;
    window.eval(apps[fixture].code);
    const app = window.hydrationTest;
    expect(app.isHydrationInProgress()).toBe(true);
    expect(errors).toEqual([]);

    let finished = false;
    async function finish() {
      if (finished) return;
      finished = true;
      stream.release();
      await stream.end;
      const fragment = window.document.createElement("div");
      fragment.innerHTML = stream.chunks.slice(consumed).join("");
      const scripts = [...fragment.querySelectorAll("script")] as HTMLScriptElement[];
      window.document.body.append(...fragment.childNodes);
      for (const script of scripts) window.eval(script.textContent);
      streaming = false;
      window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
      await vi.waitFor(() => expect(app.isHydrationInProgress()).toBe(false));
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    // The page's clock: bootTime was read when the client bundle evaluated.
    function advanceClock(ms: number) {
      const now = window.Date.now.bind(window.Date);
      window.Date.now = () => now() + ms;
    }

    return { dom, window, app, errors, fetches, finish, advanceClock };
  }

  // Home's query entry is adopted while its boundary resumes, so returning to
  // "/" inside the preload window reuses the adopted promise.
  async function roundTrip(window: any, app: any) {
    await vi.waitFor(() => expect(window.location.pathname).toBe("/destination"));
    await vi.waitFor(() =>
      expect(window.document.querySelector("h1").textContent).toBe("Destination ready")
    );
    await vi.waitFor(() => expect(app.isRouting()).toBe(false));
    window.document.querySelector("a").click();
    await vi.waitFor(() => expect(window.location.pathname).toBe("/"), { timeout: 500 });
    await vi.waitFor(() =>
      expect(window.document.querySelector("h1").textContent).toBe("Home ready")
    );
    await vi.waitFor(() => expect(app.isRouting()).toBe(false));
  }

  test("navigation after the stream ends can return to the hydrated route", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      await finish();
      window.document.querySelector("a").click();
      await roundTrip(window, app);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  test("a link click mid-stream settles and later navigations run (solid #3721)", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      window.document.querySelector("a").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(window.location.pathname).toBe("/destination"));
      expect(app.isHydrationInProgress()).toBe(true);

      await finish();
      expect(window.document.querySelector('template[id^="pl-"]')).toBeNull();
      await roundTrip(window, app);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  describe("a boundary resuming after the initial hydration pass", () => {
    async function visitOther(window: any, app: any) {
      window.document.querySelector("#other").click();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/other"));
      await vi.waitFor(
        () => expect(window.document.querySelector("h1").textContent).toBe("Other: User ready"),
        { timeout: 1000 }
      );
      await vi.waitFor(() => expect(app.isRouting()).toBe(false));
    }

    test("isHydrating() holds inside its tracking run", async () => {
      const { dom, window, app, errors, finish, advanceClock } =
        await setup("hydration-late-boundary");
      try {
        // The initial pass is over; only the streamed boundary is pending.
        expect(app.isHydrating()).toBe(false);
        expect(app.log.filter((e: any) => e.key === "badge")).toEqual([]);
        advanceClock(PRELOAD_TIMEOUT + 1000);
        await finish();
        expect(window.document.querySelector("#user").textContent).toBe("User ready");
        const traced = app.log.filter((e: any) => e.key === "badge" && e.tracing);
        expect(traced.length).toBeGreaterThan(0);
        expect(traced.map((e: any) => e.hydrating)).not.toContain(false);
        expect(errors).toEqual([]);
      } finally {
        await finish();
        app.dispose();
        dom.window.close();
      }
    });

    test("a navigation inside the short window reuses the entry adopted in a tracking run", async () => {
      const { dom, window, app, errors, fetches, finish } = await setup("hydration-late-boundary");
      try {
        await finish();
        await visitOther(window, app);
        expect(app.log.filter((e: any) => e.key === "user")).toEqual([]);
        expect(fetches).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await finish();
        app.dispose();
        dom.window.close();
      }
    });

    for (const asyncUser of [false, true])
      test(`past the short window it reuses the adopted entry instead of refetching (${asyncUser ? "async fn" : "fetch chain"})`, async () => {
        const { dom, window, app, errors, fetches, finish, advanceClock } = await setup(
          "hydration-late-boundary",
          { asyncUser }
        );
        try {
          advanceClock(PRELOAD_TIMEOUT + 1000);
          await finish();
          expect(window.document.querySelector("#user").textContent).toBe("User ready");
          expect(app.log.filter((e: any) => e.key === "user")).toEqual([]);
          expect(fetches).toEqual([]);
          // Nothing unsettled was cached: later navigations complete.
          await visitOther(window, app);
          window.document.querySelector("#home").click();
          await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
          await vi.waitFor(() => expect(app.isRouting()).toBe(false));
          expect(errors).toEqual([]);
        } finally {
          await finish();
          app.dispose();
          dom.window.close();
        }
      });

    test("a link click mid-stream past the short window lands once the boundary resumes", async () => {
      const { dom, window, app, errors, fetches, finish, advanceClock } =
        await setup("hydration-late-boundary");
      try {
        advanceClock(PRELOAD_TIMEOUT + 1000);
        window.document.querySelector("#other").click();
        await vi.waitFor(() => expect(window.location.pathname).toBe("/other"));
        expect(app.isHydrationInProgress()).toBe(true);
        await finish();
        await vi.waitFor(
          () => expect(window.document.querySelector("h1").textContent).toBe("Other: User ready"),
          { timeout: 1000 }
        );
        await vi.waitFor(() => expect(app.isRouting()).toBe(false));
        expect(app.log.filter((e: any) => e.key === "user")).toEqual([]);
        expect(fetches).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await finish();
        app.dispose();
        dom.window.close();
      }
    });
  });
});
