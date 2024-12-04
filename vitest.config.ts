import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
export default defineConfig({
  plugins: [solidPlugin()],
  resolve:{
    conditions: ['module', 'browser', 'development|production']
  },
  ssr: {
    resolve: {
      conditions: ['module', 'node', 'development|production']
    }
  },
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
  test:{
    environment: 'jsdom',
    globals: true,
    testTransformMode: { web: ["/\.[jt]sx?$/"] },
  }
});