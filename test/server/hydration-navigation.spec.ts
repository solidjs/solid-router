// @vitest-environment node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, createServer, type Plugin, type ViteDevServer } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { vi } from "vitest";

const { JSDOM, VirtualConsole } = createRequire(import.meta.url)("jsdom");
const root = fileURLToPath(new URL("../../", import.meta.url));
const serverEntry = `${root}test/fixtures/hydration-server.tsx`;
const clientEntry = `${root}test/fixtures/hydration-client.tsx`;

// Compile the same fixture for SSR and hydration without changing the posture
// of the ordinary component tests. The generated entries stay in memory.
const entries: Plugin = {
  name: "hydration-test-entries",
  resolveId(id) {
    if (id === serverEntry || id === clientEntry) return id;
  },
  load(id) {
    if (id === clientEntry)
      return `
        import { hydrate } from "@solidjs/web";
        import { createApp } from "./hydration-navigation";
        const app = createApp();
        const dispose = hydrate(() => <app.App />, document.getElementById("app"));
        globalThis.hydrationTest = { ...app, dispose };
      `;
    if (id === serverEntry)
      return `
        import { createRequestEvent, generateHydrationScript, renderToStream } from "@solidjs/web";
        import { provideRequestEvent } from "@solidjs/web/storage";
        import { createApp } from "./hydration-navigation";
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
      `;
  }
};

describe("navigation during hydration", () => {
  let server: ViteDevServer;
  let code: string;
  let start: () => {
    chunks: string[];
    shell: Promise<void>;
    end: Promise<void>;
    release: () => void;
    bootstrap: string;
  };

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
    ({ start } = await server.ssrLoadModule(serverEntry));
    const built = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [entries, solidPlugin({ hot: false, dev: true, solid: { hydratable: true } })],
      resolve: { conditions: ["browser", "development"] },
      build: {
        write: false,
        minify: false,
        lib: { entry: clientEntry, name: "HydrationTest", formats: ["iife"] },
        rolldownOptions: { output: { format: "iife", codeSplitting: false } }
      }
    });
    const output = Array.isArray(built) ? built[0] : built;
    if (!("output" in output)) throw new Error("Expected an in-memory build");
    const chunk = output.output.find(file => file.type === "chunk");
    if (!chunk || chunk.type !== "chunk") throw new Error("Missing hydration entry");
    code = chunk.code;
  }, 30000);

  afterAll(async () => {
    await server?.close();
  });

  async function setup() {
    const stream = start();
    await stream.shell;
    const consumed = stream.chunks.length;
    const errors: unknown[] = [];
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
          scrollTo: () => {},
          fetch,
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
    window.eval(code);
    const app = window.hydrationTest;
    expect(app.sharedConfig.isHydrationInProgress()).toBe(true);
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
      await vi.waitFor(() => expect(app.sharedConfig.isHydrationInProgress()).toBe(false));
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    return { dom, window, app, errors, finish };
  }

  test("an early link click waits for the stream and leaves the destination interactive", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      window.document.querySelector("a").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(app.sharedConfig.isHydrationInProgress()).toBe(true);
      expect(window.location.pathname).toBe("/");

      await finish();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/destination"));
      expect(window.document.querySelector("h1").textContent).toBe("Destination ready");
      expect(window.document.querySelector('template[id^="pl-"]')).toBeNull();
      window.document.querySelector("a").click();
      await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
      expect(window.document.querySelector("h1").textContent).toBe("Home ready");
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  test("queued navigation and search updates keep their order", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      const { navigate, setSearch } = app.controls();
      navigate("/destination", { scroll: false });
      setSearch({ a: "1" });
      setSearch({ b: "2" });
      app.sharedConfig.onHydrationEnd(() => setSearch({ c: "3" }));
      expect(app.sharedConfig.isHydrationInProgress()).toBe(true);
      expect(window.location.pathname).toBe("/");
      await finish();
      await vi.waitFor(() =>
        expect(window.location.pathname + window.location.search).toBe("/destination?a=1&b=2&c=3")
      );
      expect(errors).toEqual([]);
    } finally {
      await finish();
      app.dispose();
      dom.window.close();
    }
  });

  test("disposing the router drops navigation queued during hydration", async () => {
    const { dom, window, app, errors, finish } = await setup();
    try {
      app.controls().navigate("/destination", { scroll: false });
      app.dispose();
      await finish();
      expect(window.location.pathname).toBe("/");
      expect(window.document.getElementById("app").childNodes).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await finish();
      dom.window.close();
    }
  });
});
