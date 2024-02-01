import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
export default defineConfig({
  plugins: [solidPlugin()],
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