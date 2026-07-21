// Generates a synthetic route tree + paths usage to measure type-level cost
// of the typed path proxy at app scale. `node gen.mjs <sections>` writes
// bench-<n>.ts with <sections> top-level sections x 5 children each
// (params, int filters, optional params, splats, search schemas mixed in).
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sections = Number(process.argv[2] || 50);

let routes = "";
for (let i = 0; i < sections; i++) {
  routes += `  {
    path: "/section${i}/:id",
    matchFilters: { id: int },
    ${i % 3 === 0 ? "search: searchSchema," : ""}
    children: [
      { path: "/" },
      { path: "/detail/:detailId" },
      { path: "/opt/:maybe?" },
      { path: "/files/*rest" },
      { path: "/settings", children: [{ path: "/" }, { path: "/advanced" }] }
    ]
  },\n`;
}

let usage = "";
for (let i = 0; i < sections; i++) {
  usage += `paths.section${i}(${i});\n`;
  usage += `paths.section${i}(${i}).detail("d${i}");\n`;
  usage += `paths.section${i}(${i}).settings.advanced();\n`;
  if (i % 3 === 0) usage += `paths.section${i}(${i}, { q: "x", page: ${i} });\n`;
}

writeFileSync(
  join(here, `bench-${sections}.ts`),
  `import { createRouter, int } from "../src/index.js";
import type { StandardSchemaV1 } from "../src/index.js";

const searchSchema = {} as StandardSchemaV1<{ q?: string; page?: number }>;

const Router = createRouter({
  routes: [
${routes}  ] as const
});
const { paths } = Router;

${usage}
export {};
`
);
console.log(`wrote bench-${sections}.ts (${sections * 6} routes)`);
