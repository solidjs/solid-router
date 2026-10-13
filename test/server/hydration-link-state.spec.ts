// @vitest-environment node
// Server-written link state (#654) is the router's after hydration.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, createServer, type Plugin, type ViteDevServer } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { vi } from "vitest";

const { JSDOM, VirtualConsole } = createRequire(import.meta.url)("jsdom");
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = `${root}test/fixtures/hydration-link-state.tsx`;
const clientEntry = `${root}test/fixtures/hydration-link-state-client.tsx`;
const serverEntry = `${root}test/fixtures/hydration-link-state-server.tsx`;

const sources = new Map<string, string>([
  [
    clientEntry,
    `
      import { hydrate } from "@solidjs/web";
      import { createApp } from "${fixture}";
      const app = createApp();
      const dispose = hydrate(() => <app.App />, document.getElementById("app"));
      globalThis.hydrationTest = { ...app, dispose };
    `
  ],
  [
    serverEntry,
    `
      import { createRequestEvent, generateHydrationScript, renderToStream } from "@solidjs/web";
      import { provideRequestEvent } from "@solidjs/web/storage";
      import { createApp } from "${fixture}";
      export function start(url) {
        const event = createRequestEvent(new Request(url));
        return provideRequestEvent(event, () => {
          const app = createApp();
          const chunks = [];
          let resolveShell, resolveEnd;
          const shell = new Promise(resolve => (resolveShell = resolve));
          const end = new Promise(resolve => (resolveEnd = resolve));
          renderToStream(() => <app.App />).pipe({
            write(chunk) { chunks.push(String(chunk)); resolveShell(); },
            end() { resolveEnd(); }
          });
          return { chunks, shell, end, release: app.release, bootstrap: generateHydrationScript() };
        });
      }
    `
  ]
]);
const entries: Plugin = {
  name: "hydration-link-state-entries",
  resolveId(id) {
    if (sources.has(id)) return id;
  },
  load(id) {
    return sources.get(id);
  }
};

const anchor = (document: Document, text: string) =>
  [...document.querySelectorAll("a")].find(a => a.textContent === text)!;
const state = (a: Element) =>
  [a.hasAttribute("data-active") && "active", a.getAttribute("aria-current")]
    .filter(Boolean)
    .join(" ");

describe("link state across hydration", () => {
  let server: ViteDevServer;
  let start: (url: string) => {
    chunks: string[];
    shell: Promise<void>;
    end: Promise<void>;
    release: () => void;
    bootstrap: string;
  };
  let code: string;

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
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  test("server link state is adopted, owned and cleared on navigation", async () => {
    const stream = start("https://site.example/about");
    await stream.shell;
    const consumed = stream.chunks.length;
    const errors: unknown[] = [];
    const console = new VirtualConsole();
    console.on("error", (error: unknown) => errors.push(error));
    console.on("warn", (warning: unknown) => errors.push(warning));
    console.on("jsdomError", (error: unknown) => errors.push(error));
    const dom = new JSDOM(stream.bootstrap + '<div id="app">' + stream.chunks.join("") + "</div>", {
      url: "https://site.example/about",
      runScripts: "dangerously",
      virtualConsole: console,
      beforeParse(window: Window) {
        Object.assign(window, {
          scrollTo: () => {},
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
    const { document } = window;
    const expected = { Home: "", About: "active page", Absolute: "active page", Authored: "page" };
    for (const [text, value] of Object.entries(expected))
      expect([text, state(anchor(document, text))]).toEqual([text, value]);

    window.eval(code);
    const app = window.hydrationTest;
    // the boundary's anchor streams in after hydration starts
    stream.release();
    await stream.end;
    expect(stream.chunks.slice(consumed).join("")).toMatch(
      /data-active aria-current="page"[^>]*>(<!--[^>]*-->)*Late/
    );
    const rest = document.createElement("div");
    rest.innerHTML = stream.chunks.slice(consumed).join("");
    const scripts = [...rest.querySelectorAll("script")];
    document.body.append(...rest.childNodes);
    for (const script of scripts) window.eval(script.textContent);
    await vi.waitFor(() => expect(app.isHydrationInProgress()).toBe(false));
    await vi.waitFor(() => expect(anchor(document, "Late")).toBeTruthy());
    expect(state(anchor(document, "Late"))).toBe("active page");
    // the server skips an authored aria-current; the client still marks it active
    expected.Authored = "active page";
    for (const [text, value] of Object.entries(expected))
      expect([text, state(anchor(document, text))]).toEqual([text, value]);

    app.navigate("/");
    await vi.waitFor(() => expect(document.querySelector("h1")!.textContent).toBe("Home"));
    expect(state(anchor(document, "Home"))).toBe("active page");
    expect(state(anchor(document, "About"))).toBe("");
    expect(state(anchor(document, "Absolute"))).toBe("");
    expect(state(anchor(document, "Late"))).toBe("");
    // authored: not the router's, so it stays
    expect(state(anchor(document, "Authored"))).toBe("page");

    app.navigate("/about");
    await vi.waitFor(() => expect(document.querySelector("h1")!.textContent).toBe("About"));
    expect(state(anchor(document, "About"))).toBe("active page");
    expect(state(anchor(document, "Home"))).toBe("");
    expect(errors).toEqual([]);
    app.dispose();
  });
});
