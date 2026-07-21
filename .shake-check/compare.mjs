// Size comparison: published 0.16.2 (npm, ./baseline/package/dist) vs the
// local v1 build (../dist) for equivalent app profiles. solid-js and
// @solidjs/web stay external — we are measuring router code only. Reported
// minified (terser) and gzipped.
import { rollup } from "rollup";
import { babel } from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));

const BASELINE = "./baseline/package/dist/index.js";
// The `solid` condition is what every bundled project resolves (vite-plugin-solid
// puts it first, SSR or not): index.jsx + the per-module tsc output, compiled by
// the app's solid preset. The flat dist/index.js only serves no-build usage.
const V1 = "../dist/index.jsx";

const entries = {
  "0.16 router-only (<Router>+<Route>)": `
    import { Router, Route } from "${BASELINE}";
    console.log(Router, Route);
  `,
  "v1  router-only (createRouter)": `
    import { createRouter } from "${V1}";
    console.log(createRouter({ routes: [{ path: "/" }] }));
  `,
  "0.16 typical (+<A>, hooks)": `
    import { Router, Route, A, useNavigate, useParams, useSearchParams, useMatch } from "${BASELINE}";
    console.log(Router, Route, A, useNavigate, useParams, useSearchParams, useMatch);
  `,
  "v1  typical (+hooks, useLinkState)": `
    import { createRouter, useNavigate, useParams, useSearchParams, useMatch, useLinkState } from "${V1}";
    console.log(createRouter({ routes: [{ path: "/" }] }), useNavigate, useParams, useSearchParams, useMatch, useLinkState);
  `,
  "0.16 full (+query/action/createAsync)": `
    import { Router, Route, A, useNavigate, useSearchParams, query, action, createAsync, useSubmissions, useAction } from "${BASELINE}";
    console.log(Router, Route, A, useNavigate, useSearchParams, query, action, createAsync, useSubmissions, useAction);
  `,
  "v1  full (+query/action)": `
    import { createRouter, useNavigate, useSearchParams, query, action, useSubmissions, useAction } from "${V1}";
    console.log(createRouter({ routes: [{ path: "/" }] }), useNavigate, useSearchParams, query, action, useSubmissions, useAction);
  `
};

for (const [name, source] of Object.entries(entries)) {
  const virtual = join(here, "compare-entry.js");
  writeFileSync(virtual, source);
  const bundle = await rollup({
    input: virtual,
    external: id =>
      id === "solid-js" || id.startsWith("solid-js/") || id.startsWith("@solidjs/web"),
    treeshake: { moduleSideEffects: "no-external" },
    plugins: [
      nodeResolve({
        browser: true,
        extensions: [".js", ".jsx"],
        exportConditions: ["solid", "browser", "production", "import"]
      }),
      babel({ extensions: [".jsx"], babelHelpers: "bundled", presets: ["solid"] })
    ],
    onwarn(warning, warn) {
      if (warning.code === "CIRCULAR_DEPENDENCY") return;
      warn(warning);
    }
  });
  const { output: minOutput } = await bundle.generate({ format: "esm", plugins: [terser()] });
  const min = minOutput[0].code;
  const gz = gzipSync(Buffer.from(min), { level: 9 });
  console.log(
    `${name.padEnd(40)} min ${(min.length / 1024).toFixed(1).padStart(5)} KB   gzip ${(
      gz.length / 1024
    ).toFixed(2)} KB`
  );
}
