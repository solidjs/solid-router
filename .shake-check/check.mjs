// One-off Phase 1 verification: bundle an app that imports only <Router>
// from the built dist and assert the data layer (query/action/flash codec)
// is tree-shaken out. Two passes:
//   1. "external" — solid-js/@solidjs/web stay external and `isServer` can't
//      fold (worst case, mirrors esbuild-class bundlers); the server-only
//      flashCookie clear half is allowed to remain here.
//   2. "browser" — @solidjs/web resolved to its browser production build so
//      `isServer` is a known `false` (mirrors a Vite production build);
//      everything flash-related must be gone.
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

const commonMarkers = {
  "action.ts": ["Only POST forms are supported", "https://action/", "routerActionSubmitHooks"],
  "query.ts": ["Cannot find cache context", "cacheKeyOp"],
  "flash codec (flash.ts)": ["$f", "Secure; HttpOnly"],
  "server-functions import": ["@solidjs/web/server-functions"]
};
const browserOnlyMarkers = {
  "flashCookie.ts clear half": ["Max-Age=0"]
};

async function run(mode) {
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

  console.log(`\n== ${mode} pass ==`);
  let failed = false;
  const markers = browser ? { ...commonMarkers, ...browserOnlyMarkers } : commonMarkers;
  for (const [module, strings] of Object.entries(markers)) {
    const hits = strings.filter(s => code.includes(s));
    if (hits.length) {
      failed = true;
      console.log(`LEAK ${module}: ${hits.join(", ")}`);
    } else {
      console.log(`ok   ${module} excluded`);
    }
  }
  console.log(`bundle size (unminified): ${(code.length / 1024).toFixed(1)} KB`);
  return failed;
}

const externalFailed = await run("external");
const browserFailed = await run("browser");
process.exit(browserFailed || externalFailed ? 1 : 0);
