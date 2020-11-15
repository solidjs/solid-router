import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";

const plugins = [
  nodeResolve({
    extensions: [".js", ".ts", ".tsx"]
  }),
  babel({
    extensions: [".js", ".ts", ".tsx"],
    babelHelpers: "bundled",
    presets: ["@babel/preset-typescript", "babel-preset-solid"],
    exclude: "node_modules/**"
  })
];

export default {
  input: "src/index.tsx",
  output: [
    {
      file: "dist//solid-app-router.cjs.js",
      format: "cjs"
    },
    {
      file: "dist//solid-app-router.js",
      format: "es"
    }
  ],
  external: ["solid-js", "solid-js/web"],
  plugins
};
