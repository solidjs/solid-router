// @vitest-environment node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, createServer, type Plugin, type ViteDevServer } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { vi } from "vitest";

const { JSDOM, VirtualConsole } = createRequire(import.meta.url)("jsdom");
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = [
  "hydration-navigation",
  "hydration-late-boundary",
  "hydration-lazy-route",
  "hydration-lazy-subtree"
] as const;
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
      app.preload?.(globalThis._$HY);
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
          renderToStream(() => <app.App />, { manifest: app.manifest }).pipe({
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

  async function setup(
    fixture: Fixture = "hydration-navigation",
    options: { navigationType?: string; scrollLog?: string[] } & Record<string, unknown> = {}
  ) {
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
        if (options.scrollLog) {
          const log = options.scrollLog;
          const positions: Record<number, number> = {};
          for (let d = 0; d < 100; d++) positions[d] = 400;
          window.sessionStorage.setItem("solid-router:scroll", JSON.stringify(positions));
          Object.defineProperty(window, "scrollTo", {
            configurable: true,
            value: (_x: number, y: number) =>
              void log.push(
                `scrollTo:${y} shows=${window.document.querySelector("main")?.textContent}`
              )
          });
        }
        if (options.navigationType) {
          const entries = [{ type: options.navigationType }];
          window.performance.getEntriesByType = ((type: string) =>
            type === "navigation" ? entries : []) as any;
        }
        Object.assign(window, {
          hydrationOptions: options,
          ...(options.scrollLog ? {} : { scrollTo: () => {} }),
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

  // #655 characterization: what the navigation-pending observables read
  // while the page hydrates, after it, and around a click mid-stream.
  test("navigation-pending state across hydration", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      const seen: string[] = [];
      const read = (label: string) => {
        const a = window.document.querySelector("a")!;
        seen.push(
          `${label}: routing=${app.isRouting()} data-pending=${a.hasAttribute("data-pending")} at=${window.location.pathname}`
        );
      };
      read("hydrating");
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      window.document.querySelector("a").dispatchEvent(click);
      read("clicked");
      await new Promise<void>(resolve => setImmediate(resolve));
      read("click flushed");
      await finish();
      read("hydrated");
      await vi.waitFor(() => expect(window.location.pathname).toBe("/destination"));
      await vi.waitFor(() => expect(app.isRouting()).toBe(false));
      read("landed");
      expect(seen).toMatchInlineSnapshot(`
        [
          "hydrating: routing=false data-pending=false at=/",
          "clicked: routing=false data-pending=false at=/",
          "click flushed: routing=false data-pending=false at=/destination",
          "hydrated: routing=false data-pending=false at=/destination",
          "landed: routing=false data-pending=false at=/destination",
        ]
      `);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  // Reloading lands on an existing entry, so scroll restoration schedules its
  // first restore while the page hydrates. That client-only setup must not
  // shift the hydration ids of what renders after it.
  test("a reload with scroll restoration hydrates the server DOM in place", async () => {
    const { dom, window, app, errors, fetches, finish } = await setup("hydration-navigation", {
      scrollRestoration: true,
      navigationType: "reload"
    });
    try {
      await finish();
      expect(window.document.querySelectorAll("main")).toHaveLength(1);
      expect(window.document.querySelector("h1").textContent).toBe("Home ready");
      expect(fetches).toEqual([]);
      window.document.querySelector("a").click();
      await roundTrip(window, app);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  // When the reload's restore runs against content that is still arriving:
  // a boundary the server streams late, a route module the client loads.
  test("reload scroll restoration while the server streams a pending boundary", async () => {
    const log: string[] = [];
    const { dom, window, app, errors, finish } = await setup("hydration-navigation", {
      scrollRestoration: true,
      navigationType: "reload",
      scrollLog: log
    });
    const mark = (label: string) =>
      log.push(
        `| ${label} shows=${window.document.querySelector("main")?.textContent} hydrating=${app.isHydrationInProgress()}`
      );
    try {
      mark("shell");
      await new Promise<void>(resolve => setImmediate(resolve));
      mark("shell flushed");
      await finish();
      mark("streamed");
      expect(log).toMatchInlineSnapshot(`
        [
          "scrollTo:400 shows=Loading...Destination",
          "| shell shows=Loading...Destination hydrating=true",
          "| shell flushed shows=Loading...Destination hydrating=true",
          "| streamed shows=Home readyDestination hydrating=false",
        ]
      `);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  test("reload scroll restoration while the route module is still loading", async () => {
    const log: string[] = [];
    const { dom, window, app, errors, finish } = await setup("hydration-lazy-route", {
      scrollRestoration: true,
      navigationType: "reload",
      scrollLog: log
    });
    const mark = (label: string) =>
      log.push(
        `| ${label} shows=${window.document.querySelector("main")?.textContent} hydrating=${app.isHydrationInProgress()}`
      );
    try {
      mark("shell");
      await new Promise(resolve => setTimeout(resolve, 10));
      mark("modules pending");
      app.releaseModules();
      await new Promise(resolve => setTimeout(resolve, 10));
      mark("modules loaded");
      await finish();
      mark("streamed");
      expect(log).toMatchInlineSnapshot(`
        [
          "scrollTo:400 shows=Home readyDestination",
          "| shell shows=Home readyDestination hydrating=true",
          "| modules pending shows=Home readyDestination hydrating=true",
          "| modules loaded shows=Home readyDestination hydrating=false",
          "| streamed shows=Home readyDestination hydrating=false",
        ]
      `);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  // `useIsRouting` read from outside the graph while the page's own route
  // code is still loading on the client, then across a navigation.
  const routingOf = (app: any) => {
    try {
      return String(app.isRouting());
    } catch (e: any) {
      if (e?.constructor?.name !== "NotReadyError") throw e;
      return "<not ready>";
    }
  };

  test("useIsRouting while the route module loads during hydration", async () => {
    const { dom, window, app, errors, finish } = await setup("hydration-lazy-route");
    const seen: string[] = [];
    const read = (label: string) =>
      seen.push(
        `${label}: routing=${routingOf(app)} hydrating=${app.isHydrationInProgress()} at=${window.location.pathname}`
      );
    try {
      read("shell");
      await new Promise(resolve => setTimeout(resolve, 10));
      read("modules pending");
      app.releaseModules();
      await new Promise(resolve => setTimeout(resolve, 10));
      read("modules loaded");
      await finish();
      read("streamed");
      window.document.querySelector("a").click();
      read("clicked");
      await new Promise(resolve => setTimeout(resolve, 10));
      read("click pending");
      app.releaseDestination();
      await vi.waitFor(() =>
        expect(window.document.querySelector("h1").textContent).toBe("Destination ready")
      );
      read("landed");
      expect(seen).toMatchInlineSnapshot(`
        [
          "shell: routing=false hydrating=true at=/",
          "modules pending: routing=false hydrating=true at=/",
          "modules loaded: routing=false hydrating=false at=/",
          "streamed: routing=false hydrating=false at=/",
          "clicked: routing=false hydrating=false at=/",
          "click pending: routing=true hydrating=false at=/",
          "landed: routing=false hydrating=false at=/destination",
        ]
      `);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  // The initial route is a lazy subtree. The server's render parks on the
  // route table; the client's, with the table already loaded, does not, and
  // client-only readers must not take ids either. The ids must line up.
  test("an initial route inside a lazy route subtree hydrates in place", async () => {
    const { dom, window, app, errors, finish } = await setup("hydration-lazy-subtree");
    const seen: string[] = [];
    const read = (label: string) =>
      seen.push(
        `${label}: routing=${routingOf(app)} hydrating=${app.isHydrationInProgress()} shows=${window.document.querySelector("main")?.textContent} at=${window.location.pathname}`
      );
    try {
      read("shell");
      app.releaseTable();
      await new Promise(resolve => setTimeout(resolve, 10));
      read("table loaded");
      await finish();
      read("streamed");
      expect(window.document.querySelectorAll("main")).toHaveLength(1);
      expect(errors).toEqual([]);
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      window.document.querySelector("a").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      await vi.waitFor(() =>
        expect(window.document.querySelector("h1").textContent).toBe("Destination")
      );
      read("landed");
      expect(window.document.querySelectorAll("main")).toHaveLength(1);
      expect(seen).toMatchInlineSnapshot(`
        [
          "shell: routing=<not ready> hydrating=true shows=Loading... at=/",
          "table loaded: routing=false hydrating=true shows=Loading... at=/",
          "streamed: routing=false hydrating=false shows=HomeDestination at=/",
          "landed: routing=false hydrating=false shows=Destination at=/destination",
        ]
      `);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  // #625: the server showed the page, but the root boundary is still waiting
  // for its route module when the click lands.
  test("a link click before the root boundary's route module loads claims the server DOM", async () => {
    const { dom, window, app, errors, finish } = await setup("hydration-lazy-route");
    try {
      expect(Object.keys(window._$HY.loading)).not.toHaveLength(0);
      expect(window.document.querySelector("h1").textContent).toBe("Home ready");
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      window.document.querySelector("a").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 10));
      app.releaseModules();
      await new Promise(resolve => setTimeout(resolve, 10));
      app.releaseDestination();
      await finish();
      await roundTrip(window, app);
      expect(window.document.querySelectorAll("main")).toHaveLength(1);
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
