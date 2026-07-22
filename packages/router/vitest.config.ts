import { defineConfig, Plugin } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin() as Plugin],
  resolve: {
    conditions: ["module", "browser", "development|production"],
    alias: {
      // the virtual manifest module a file-routes delivery adapter serves
      "solid:file-routes": new URL("./test/fixtures/file-routes-manifest.ts", import.meta.url)
        .pathname
    }
  },
  ssr: {
    resolve: {
      conditions: ["module", "node", "development|production"]
    }
  },
  server: {
    port: 3000
  },
  build: {
    target: "esnext"
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTransformMode: { web: ["/\.[jt]sx?$/"] },
    setupFiles: ["./test/setup.ts"],
    mockReset: true
  }
});
