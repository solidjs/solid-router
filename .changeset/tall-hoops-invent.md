---
"@solidjs/file-routes": minor
"@solidjs/router": minor
---

Move file-system routing from SolidStart into router-neutral packages: `@solidjs/file-routes` scans a route directory into a neutral route manifest with pluggable conventions, `@solidjs/file-routes/vite` delivers it as the `solid:file-routes` virtual module with HMR and per-export code splitting, and `@solidjs/router/fs` ships Solid Router's emission adapter — `createFileRoutes` and `<FileRoutes>`.
