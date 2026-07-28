// One-off verification: a Router-only app tree-shakes the data layer
// (query/action/flash codec). The router core imports the runtime's shared
// server-functions entry (flash detect/clear), which is expected; the
// codec-bearing /server entry must never appear in a client bundle.
//
// Three passes:
//   1. "external" — the flat dist/index.js with solid-js/@solidjs/web
//      external and `isServer` unfoldable (worst case, mirrors esbuild-class
//      bundlers). The flat bundle is the no-build fallback and is built with
//      inlineDynamicImports, so events.ts's lazy serverForms fallback — and
//      with it action.ts/query.ts — is inlined BY DESIGN (see
//      rollup.config.js); only the flash codec markers apply.
//   2. "browser" — the flat bundle with @solidjs/web resolved to its browser
//      production build (`isServer` folds to false). Same inlining caveat;
//      everything flash-related must be gone.
//   3. "split" — the per-module `solid`-condition output (dist/index.jsx)
//      that every vite-plugin-solid app consumes, compiled with
//      babel-preset-solid and code splitting allowed. This is where the
//      data-layer guarantee lives: the entry chunk must exclude
//      action/query/flash entirely, with the serverForms delegation
//      fallback isolated in its own lazy chunk.
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

// "https://action/" is not a marker: the delegation fallback moved that
// check into core events.ts.
const dataLayerMarkers = {
  "action.ts": ["Only POST forms are supported", "routerActionSubmitHooks"],
  "query.ts": ["Cannot find cache context", "cacheKeyOp"]
};
// The bare "@solidjs/web/server-functions/server" specifier is allowed to
// survive in the external flat pass: `isServer` can't fold there, so the
// decoder wiring keeps its import. Conditions-resolving bundlers drop it
// (browser/split passes prove that); these markers assert the codec's
// *content* never lands in a client bundle.
const flashCodecMarkers = {
  "flash codec (server-functions/server)": ["$f", "Secure; HttpOnly"]
};
const flashClearMarkers = {
  "flash clear half (server-functions shared)": ["Max-Age=0"]
};

function scan(code, markers) {
  let failed = false;
  for (const [module, strings] of Object.entries(markers)) {
    const hits = strings.filter(s => code.includes(s));
    if (hits.length) {
      failed = true;
      console.log(`LEAK ${module}: ${hits.join(", ")}`);
    } else {
      console.log(`ok   ${module} excluded`);
    }
  }
  return failed;
}

async function flatPass(mode) {
  const browser = mode === "browser";
  const bundle = await rollup({
    input: join(here, "entry.js"),
    external: browser
      ? id => id === "solid-js"
      : id => id === "solid-js" || id.startsWith("@solidjs/"),
    treeshake: { moduleSideEffects: "no-external" },
    plugins: browser
      ? [nodeResolve({ browser: true, exportConditions: ["browser", "production", "import"] })]
      : [],
    onwarn(warning, warn) {
      if (warning.code === "CIRCULAR_DEPENDENCY") return;
      warn(warning);
    }
  });
  const { output } = await bundle.generate({ format: "esm" });
  const code = output[0].code;
  writeFileSync(join(here, `out-${mode}.js`), code);

  console.log(`\n== ${mode} pass (flat no-build bundle; data layer inlined by design) ==`);
  const failed = scan(code, browser ? { ...flashCodecMarkers, ...flashClearMarkers } : flashCodecMarkers);
  console.log(`bundle size (unminified): ${(code.length / 1024).toFixed(1)} KB`);
  return failed;
}

async function splitPass() {
  const bundle = await rollup({
    input: join(here, "entry-split.js"),
    external: id => id === "solid-js",
    treeshake: { moduleSideEffects: "no-external" },
    plugins: [
      nodeResolve({
        browser: true,
        extensions: [".js", ".jsx"],
        exportConditions: ["browser", "production", "import"]
      }),
      babel({
        extensions: [".js", ".jsx"],
        babelHelpers: "bundled",
        presets: ["solid"]
      })
    ],
    onwarn(warning, warn) {
      if (warning.code === "CIRCULAR_DEPENDENCY") return;
      warn(warning);
    }
  });
  const { output } = await bundle.generate({ format: "esm" });
  const entryChunks = output.filter(c => c.type === "chunk" && !c.isDynamicEntry);
  const lazyChunks = output.filter(c => c.type === "chunk" && c.isDynamicEntry);
  const eagerCode = entryChunks.map(c => c.code).join("\n");
  writeFileSync(join(here, "out-split.js"), eagerCode);

  console.log(`\n== split pass (solid-condition per-module output, mirrors vite) ==`);
  let failed = scan(eagerCode, {
    ...dataLayerMarkers,
    ...flashCodecMarkers,
    ...flashClearMarkers
  });
  if (!lazyChunks.length) {
    failed = true;
    console.log("LEAK serverForms fallback: no lazy chunk emitted (split point lost)");
  } else {
    console.log(`ok   serverForms fallback isolated in lazy chunk (${lazyChunks.map(c => c.fileName).join(", ")})`);
  }
  console.log(`eager size (unminified): ${(eagerCode.length / 1024).toFixed(1)} KB`);
  return failed;
}

const externalFailed = await flatPass("external");
const browserFailed = await flatPass("browser");
const splitFailed = await splitPass();
process.exit(externalFailed || browserFailed || splitFailed ? 1 : 0);
