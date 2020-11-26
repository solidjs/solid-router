import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default {
  input: "src/index.tsx",
  output: [
    {
      file: "dist/solid-app-router.min.js",
      format: "es"
    }
  ],
  external: ["solid-js", "solid-js/web"],
  plugins: [
    nodeResolve({
      extensions: [".js", ".ts", ".tsx"]
    }),
    babel({
      extensions: [".js", ".ts", ".tsx"],
      babelHelpers: "bundled",
      presets: ["solid", "@babel/preset-typescript"],
      exclude: "node_modules/**"
    }),
    terser({ output: { comments: false } })
  ]
};
