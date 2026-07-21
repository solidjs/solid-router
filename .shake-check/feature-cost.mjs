// Cost attribution for always-on features in the client router-only bundle:
// build the same entry from src (isServer folded), stubbing one feature at a
// time. min+gzip delta vs baseline = what that feature costs every app.
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

// Feature stubs: each replaces a module (or patches source) to remove one
// always-on feature while keeping the router functional enough to bundle.
const stubs = {
  baseline: null,
  claims: {
    load(id) {
      if (id.endsWith("/src/claims.ts")) return "export function setupLinkClaims() {}";
    }
  },
  beforeLeave: {
    load(id) {
      if (id.endsWith("/src/lifecycle.ts"))
        return `
          export function createBeforeLeave() { return { subscribe: () => () => {}, confirm: () => true } }
          export const useBeforeLeave = () => {};
        `;
    }
  },
  depthStamping: {
    transform(code, id) {
      if (id.endsWith("/src/routers/history.ts"))
        return code
          .replace(/function saveCurrentDepth\(\) \{[\s\S]*?\n\}/m, "function saveCurrentDepth() {}")
          .replace(/function keepDepth\(state\) \{[\s\S]*?\n\}/m, "function keepDepth(state) { return state; }")
          .replace(
            /function notifyIfNotBlocked\([\s\S]*?\n\}/m,
            "function notifyIfNotBlocked(notify) { return () => notify(); }"
          );
    }
  },
  hoverPreload: {
    transform(code, id) {
      if (id.endsWith("/src/data/events.ts"))
        return code.replace(/if \(preload\) \{[\s\S]*?\}\n/g, "");
    }
  },
  pathsProxy: {
    load(id) {
      if (id.endsWith("/src/paths.ts"))
        return "export const int = () => true; export function createPathsProxy() { return {}; }";
    }
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
      ...(stub ? [{ name: "stub", ...stub }] : []),
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

const base = await measure(null);
console.log(`baseline        min ${(base.min / 1024).toFixed(2)} KB  gzip ${(base.gz / 1024).toFixed(2)} KB`);
for (const [name, stub] of Object.entries(stubs)) {
  if (!stub) continue;
  const r = await measure(stub);
  console.log(
    `${name.padEnd(15)} costs  min ${((base.min - r.min) / 1024).toFixed(2)} KB  gzip ${(
      (base.gz - r.gz) / 1024
    ).toFixed(2)} KB`
  );
}
