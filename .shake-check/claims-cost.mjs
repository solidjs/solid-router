// What does the claims consumer cost the client router-only bundle? Builds
// the same entry twice from src (isServer folded false): once as-is, once
// with src/claims.ts stubbed to a no-op. min+gzip delta = the feature's cost.
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const SHIMMED = ["@solidjs/web", "@solidjs/web/server-functions"];
const EXT = "\0ext:";
const webShim = {
  name: "web-shim",
  resolveId(id) {
    if (SHIMMED.includes(id)) return "\0shim:" + id;
    if (id.startsWith(EXT)) return { id: id.slice(EXT.length), external: true };
  },
  load(id) {
    if (id.startsWith("\0shim:")) {
      const real = id.slice("\0shim:".length);
      return `export const isServer = false;\nexport * from ${JSON.stringify(EXT + real)};`;
    }
  }
};

const claimsStub = {
  name: "claims-stub",
  load(id) {
    if (id.endsWith("/src/claims.ts")) return "export function setupLinkClaims() {}";
  }
};

async function measure(stub) {
  const virtual = join(here, "compare-entry.js");
  writeFileSync(
    virtual,
    `import { createRouter } from "../src/index.tsx";
     console.log(createRouter({ routes: [{ path: "/" }] }));`
  );
  const bundle = await rollup({
    input: virtual,
    external: id => id === "solid-js" || id.startsWith("solid-js/"),
    treeshake: { moduleSideEffects: "no-external" },
    plugins: [
      ...(stub ? [claimsStub] : []),
      webShim,
      nodeResolve({ extensions: [".js", ".ts", ".tsx"], rootDir: root }),
      babel({
        cwd: root,
        extensions: [".js", ".ts", ".tsx"],
        babelHelpers: "bundled",
        presets: ["solid", "@babel/preset-typescript"],
        exclude: ["node_modules/**"]
      })
    ],
    onwarn(warning, warn) {
      if (warning.code === "CIRCULAR_DEPENDENCY") return;
      warn(warning);
    }
  });
  const { output } = await bundle.generate({ format: "esm", plugins: [terser()] });
  const min = output[0].code;
  return { min: min.length, gz: gzipSync(Buffer.from(min), { level: 9 }).length };
}

const withClaims = await measure(false);
const withoutClaims = await measure(true);
const fmt = b => (b / 1024).toFixed(2) + " KB";
console.log(`with claims     min ${fmt(withClaims.min)}  gzip ${fmt(withClaims.gz)}`);
console.log(`without claims  min ${fmt(withoutClaims.min)}  gzip ${fmt(withoutClaims.gz)}`);
console.log(
  `claims cost     min ${fmt(withClaims.min - withoutClaims.min)}  gzip ${fmt(
    withClaims.gz - withoutClaims.gz
  )}`
);
