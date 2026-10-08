import { defineConfig, Plugin } from "vitest/config";
import solidPlugin from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solidPlugin() as Plugin],
  // Vite string-replaces this; Vitest pulls simple identifiers off `define`
  // and assigns the parsed boolean onto `globalThis` per worker, so tests can
  // stub it. `"true"` parses to the boolean `true`.
  define: {
    __SOLID_SERVER_COMPONENTS__: "true"
  },
  resolve: {
    conditions: ["module", "browser", "development|production"],
    // the fs adapter's runtime-only peer; the shipped module says `true`
    alias: { "filesystem-routing/flags": "/test/fixtures/fs-flags.ts" }
  },
  ssr: {
    resolve: {
      conditions: ["module", "browser", "development|production"]
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
    mockReset: true,
    // server-mode specs run under vitest.config.server.ts (node conditions)
    exclude: ["**/node_modules/**", "test/server/**"]
  }
});
