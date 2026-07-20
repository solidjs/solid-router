// Server-mode test config: node resolve conditions so @solidjs/web and
// solid-js resolve to their server builds (isServer true, real request-event
// scoping via @solidjs/web/storage). Exercises the server integration in
// src/server.ts, which the jsdom suite cannot reach. The solid plugin runs
// in ssr mode so specs can hand JSX <Route> trees to the collector.
import { defineConfig, Plugin } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin({ ssr: true, solid: { hydratable: false } }) as Plugin],
  resolve: {
    conditions: ["node", "module", "development|production"]
  },
  ssr: {
    resolve: {
      conditions: ["node", "module", "development|production"]
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["test/server/**/*.spec.{ts,tsx}"]
  }
});
