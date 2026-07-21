import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.tsx",
  output: [
    {
      file: "dist/index.js",
      format: "es",
      // The flat bundle is the no-build fallback only — every bundled
      // project resolves the `solid` condition (index.jsx + the per-module
      // tsc output), where data/events.ts's lazy serverForms import
      // survives naturally. Inlining it here just keeps the single file
      // self-contained.
      inlineDynamicImports: true
    }
  ],
  external: ["solid-js", "@solidjs/web", "@solidjs/web/server-functions"],
  plugins: [
    nodeResolve({
      extensions: [".js", ".ts", ".tsx"]
    }),
    babel({
      extensions: [".js", ".ts", ".tsx"],
      babelHelpers: "bundled",
      presets: ["solid", "@babel/preset-typescript"],
      exclude: ["node_modules/**", "**/*.spec.ts"]
    })
  ]
};
