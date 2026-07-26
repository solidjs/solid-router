// A stand-in for the `virtual:file-routes` module that a
// `@solidjs/file-routes` delivery adapter serves at build time: the flat
// manifest as the default export, and the nested page view alongside it.
import type { FileRouteEntry, FileRouteTreeEntry } from "../../src/fs.js";

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

// Neither entry nests under the other, so the two views coincide here.
export const pageRoutes: FileRouteTreeEntry[] = manifest;

export default manifest;
