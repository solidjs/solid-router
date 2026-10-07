// Guards #655: an app that never imports `action` must not bundle the action
// layer — the form-submit handler, submission/busy state, single-flight
// consumer, and signals' `action` — in its eager graph. The router core holds
// only the seams the action module fills on first `action()` (events.ts's
// form handler, claims.ts's form slot, routing.ts's flight consumer and flash
// decoder) plus the lazy fallback for server-function forms, whose target is
// a split point. Two apps are bundled against the built `dist/` through both
// resolution paths a consumer can take: the flat build (no `solid`
// condition: Rolldown, esbuild and webpack defaults) and the `solid`
// condition compiled by @solidjs/vite-plugin. solid-js and @solidjs/web are
// bundled in, so what the action layer retains from them is visible too.
//
// `isPending`/`latest` are not markers: the router core reads them itself
// (`isRouting`, navigation intent), and through them signals' optimistic
// engine is retained by every router app.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { build } from "vite";
import solid from "@solidjs/vite-plugin";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
// literals that survive minification
const LITERALS = [
  "Only POST forms are supported for Actions",
  "Client Actions need explicit names if server rendered",
  "routerActionSubmitHooks"
];
// declarations, read from an unminified build (comments can mention the
// names, never declare them)
const DECLARATIONS = [
  "handleFormAction",
  "markFormBusy",
  "toAction",
  "settleActionResult",
  "setupFlightDataConsumer",
  "installRouterIntegrations",
  // @solidjs/signals' action and its transition bookkeeping
  "restoreTransition"
];

const app = entry => `import { createRouter, useNavigate, query } from "${dist}${entry}";
const getItem = query(async id => ({ id }), "item");
function Home() {
  const navigate = useNavigate();
  return () => navigate("/item/1");
}
export const Router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/item/:id", component: () => null, preload: ({ params }) => getItem(params.id) }
  ]
});
`;
const withAction = entry =>
  app(entry) +
  `import { action } from "${dist}${entry}";
export const save = action(async (data) => void data, "save");
`;

const root = mkdtempSync(join(tmpdir(), "router-action-gate-"));
writeFileSync(join(root, "package.json"), `{ "name": "action-gate", "type": "module" }`);

const brotli = s =>
  brotliCompressSync(Buffer.from(s), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

/** The eager graph's code: the entry chunk and every chunk it imports statically. */
async function bundle(input, conditions, plugins, minify) {
  const result = await build({
    root,
    logLevel: "warn",
    configFile: false,
    plugins,
    resolve: { conditions },
    build: {
      write: false,
      minify,
      modulePreload: false,
      rollupOptions: {
        input,
        preserveEntrySignatures: "strict",
        // with `action` imported, the lazy fallback's target is eager by design
        onwarn: (warning, warn) => warning.code !== "INEFFECTIVE_DYNAMIC_IMPORT" && warn(warning)
      }
    }
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap(r => r.output)
    .filter(c => c.type === "chunk");
  const byName = new Map(chunks.map(c => [c.fileName, c]));
  const eager = new Set();
  const walk = c => {
    if (!c || eager.has(c)) return;
    eager.add(c);
    c.imports.forEach(i => walk(byName.get(i)));
  };
  walk(chunks.find(c => c.isEntry));
  return [...eager].map(c => c.code).join("\n");
}

const found = (min, plain) => [
  ...LITERALS.filter(s => min.includes(s)),
  ...DECLARATIONS.filter(s => plain.includes(`function ${s}(`))
];

const paths = {
  flat: { entry: "index.js", conditions: ["browser", "import", "module", "default"], plugins: [] },
  solid: {
    entry: "index.jsx",
    conditions: ["solid", "browser", "import", "module", "default"],
    plugins: [solid()]
  }
};

try {
  const failures = [];
  for (const [name, { entry, conditions, plugins }] of Object.entries(paths)) {
    const sizes = [];
    for (const [variant, source] of [
      ["read-only", app(entry)],
      ["+action", withAction(entry)]
    ]) {
      const input = join(root, `${name}-${variant.replace(/\W/g, "")}.jsx`);
      writeFileSync(input, source);
      const [min, plain] = await Promise.all([
        bundle(input, conditions, plugins, true),
        bundle(input, conditions, plugins, false)
      ]);
      const hits = found(min, plain);
      sizes.push(`${variant} ${min.length} B min / ${brotli(min)} B br`);
      if (variant === "read-only" && hits.length)
        failures.push(`${name} read-only bundle carries the action layer: ${hits.join(", ")}`);
      if (variant === "+action") {
        const missing = [...LITERALS, ...DECLARATIONS].filter(m => !hits.includes(m));
        if (missing.length)
          failures.push(
            `${name} +action bundle lacks ${missing.join(", ")} — markers moved, update scripts/check-action-gate.mjs`
          );
      }
    }
    console.log(`action gate (${name}): ${sizes.join(", ")}`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  rmSync(root, { recursive: true, force: true });
}
