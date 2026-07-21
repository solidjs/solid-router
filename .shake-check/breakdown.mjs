// Per-module size breakdown of the v1 router-only path, bundled straight
// from src with the package's own babel setup so rollup can report
// renderedLength per source module (pre-minification; proportions hold).
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const virtual = join(here, "compare-entry.js");
writeFileSync(
  virtual,
  `import { createRouter } from "../src/index.tsx";
   console.log(createRouter({ routes: [{ path: "/" }] }));`
);

// client build: isServer folds to false, rest of the web runtime stays external
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

const bundle = await rollup({
  input: virtual,
  external: id => id === "solid-js" || id.startsWith("solid-js/"),
  treeshake: { moduleSideEffects: "no-external" },
  plugins: [
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
const { output } = await bundle.generate({ format: "esm" });
const modules = Object.entries(output[0].modules)
  .map(([id, m]) => [relative(root, id), m.renderedLength])
  .sort((a, b) => b[1] - a[1]);
console.log("== v1 router-only, per src module (rendered bytes) ==");
for (const [id, len] of modules) if (len > 0) console.log(`${String(len).padStart(7)}  ${id}`);
console.log(`${String(modules.reduce((a, [, l]) => a + l, 0)).padStart(7)}  TOTAL`);
