// A stand-in for the `solid:file-routes` virtual module that a
// `@solidjs/file-routes` delivery adapter serves at build time.
import type { FileRouteEntry } from "../../src/fs.js";

const manifest: FileRouteEntry[] = [
  {
    path: "/",
    page: true,
    $component: {
      src: "src/routes/index.tsx",
      import: async () => ({ default: () => "Home" })
    }
  },
  {
    path: "/about",
    page: true,
    $component: {
      src: "src/routes/about.tsx",
      import: async () => ({ default: () => "About" })
    }
  }
];

export default manifest;
