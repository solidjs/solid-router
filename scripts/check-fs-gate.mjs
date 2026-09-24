// Guards the size promise of `@solidjs/router/fs`: an app with no server page
// must not bundle the server component route machinery (serverRouteComponent,
// query/liveQuery, frames). The adapter reaches it only through fsServer.ts,
// gated on `serverRoutes` from `filesystem-routing/flags` — a literal the
// file-routes plugin folds from its scan. Here that module is stubbed each
// way against the built `dist/`, the way a consumer's bundle sees it.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
// a literal from serverRouteComponent.ts that survives minification; the
// module is fsServer.ts's, so its presence means the whole gated import came in
const MARKERS = ["serverRouteComponent(): mount it"];

const root = mkdtempSync(join(tmpdir(), "router-fs-gate-"));
writeFileSync(
  join(root, "entry.js"),
  `import { createRouter } from "${dist}index.js";
import { fileRoutes } from "${dist}fs.js";
export const Router = createRouter({
  routes: fileRoutes([
    { path: "/", page: true, $component: { src: "/routes/index.tsx", require: () => ({ default: () => null }) } },
    { path: "/s", page: true, server: true, $component: { src: "/routes/s.tsx", require: () => ({ default: async () => () => null }) } }
  ])
});
`
);

async function bundle(flag) {
  const result = await build({
    root,
    logLevel: "warn",
    configFile: false,
    resolve: { conditions: ["browser", "import", "module", "default"] },
    build: {
      write: false,
      minify: true,
      modulePreload: false,
      rollupOptions: { input: join(root, "entry.js"), output: { entryFileNames: "out.js" } }
    },
    plugins: [
      {
        name: "fs-flags-stub",
        enforce: "pre",
        resolveId: id => (id === "filesystem-routing/flags" ? "\0fs-flags" : undefined),
        load: id => (id === "\0fs-flags" ? `export const serverRoutes = ${flag};` : undefined)
      }
    ]
  });
  const out = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
  return out.map(chunk => chunk.code ?? "").join("");
}

try {
  const [off, on] = await Promise.all([bundle(false), bundle(true)]);
  const kb = s => (Buffer.byteLength(s) / 1024).toFixed(1) + " KB";
  console.log(`fs gate: serverRoutes=false ${kb(off)}, serverRoutes=true ${kb(on)}`);
  for (const marker of MARKERS) {
    if (off.includes(marker)) {
      throw new Error(`fs gate: "${marker}" reached a bundle with no server page`);
    }
    if (!on.includes(marker)) {
      throw new Error(`fs gate: "${marker}" moved — update MARKERS in scripts/check-fs-gate.mjs`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
