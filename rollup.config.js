import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

const plugins = [
  nodeResolve({
    extensions: [".js", ".ts", ".tsx"]
  }),
  babel({
    extensions: [".js", ".ts", ".tsx"],
    babelHelpers: "bundled",
    presets: ["solid", "@babel/preset-typescript"],
    exclude: "node_modules/**"
  })
];

export default [
  {
    input: "src/index.tsx",
    output: [
      {
        file: "dist/index.js",
        format: "es"
      }
    ],
    external: ["solid-js", "solid-js/web"],
    plugins: [
      replace({
        '"_SOLID_DEV_"': false,
        preventAssignment: true,
        delimiters: ["", ""]
      })
    ].concat(plugins)
  },
  {
    input: "src/index.tsx",
    output: [
      {
        file: "dist/dev.js",
        format: "es"
      }
    ],
    external: ["solid-js", "solid-js/web"],
    plugins
  }
];
