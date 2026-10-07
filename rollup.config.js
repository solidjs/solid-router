import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.tsx",
  output: [
    {
      dir: "dist",
      format: "es",
      entryFileNames: "index.js",
      // The flat build is what every bundler resolves without the `solid`
      // condition (Rolldown, esbuild and webpack defaults), so it must keep
      // the data layer's split: action.ts is its own module, reached
      // statically only through the `action` exports and otherwise only by
      // events.ts's lazy serverForms fallback. Inlined into index.js it was
      // retained by every router-only app (#655). query.ts is its own chunk
      // for the same reason: the fallback needs it, and a bundler cannot
      // move part of a module into a lazy chunk.
      // The rest of the source is pinned to a core chunk (a manual chunk
      // otherwise absorbs its dependencies, the whole core with them); the
      // re-exporting index modules stay in the entry, so the core never
      // imports the action chunk statically.
      chunkFileNames: "index-[name].js",
      manualChunks: id =>
        /[\\/]src[\\/]data[\\/](action|serverForms)\.ts$/.test(id)
          ? "action"
          : /[\\/]src[\\/]data[\\/]query\.ts$/.test(id)
            ? "query"
            : /[\\/]src[\\/]/.test(id) && !/[\\/]index\.tsx?$/.test(id)
              ? "core"
              : undefined
    }
  ],
  external: id => id === "solid-js" || id === "@solidjs/web" || id.startsWith("@solidjs/web/"),
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
