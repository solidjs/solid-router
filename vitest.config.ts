import { defineConfig, Plugin } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin() as Plugin],
  resolve: {
    conditions: ["module", "browser", "development|production"]
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
