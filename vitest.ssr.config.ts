import { defineConfig, Plugin } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

// Server rendering needs the SSR JSX transform and the real `isServer`, so it cannot
// share the DOM config or its setup file. Specs live in test/ssr.
export default defineConfig({
  plugins: [solidPlugin({ solid: { generate: "ssr", hydratable: true } }) as Plugin],
  resolve: {
    conditions: ["module", "node", "development|production"]
  },
  build: {
    target: "esnext"
  },
  test: {
    environment: "node",
    globals: true,
    include: ["test/ssr/**/*.spec.tsx"],
    mockReset: true
  }
});
