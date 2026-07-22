import { fileRoutes } from "@solidjs/file-routes/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // `extensions` makes vite-plugin-solid also compile the `?pick=` route
  // modules the file-routes plugin emits (their ids end in a query string)
  plugins: [solid({ extensions: [".jsx", ".tsx"] }), fileRoutes()],
  optimizeDeps: {
    // pre-bundle everything the workspace-linked router pulls in, so the
    // dep optimizer doesn't re-run mid-page-load with a second solid-js copy
    include: ["solid-js", "solid-js/web", "solid-js/store"]
  }
});
