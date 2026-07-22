import fs from "node:fs";
import { parseSync, type StaticExportEntry } from "oxc-parser";

export type { StaticExportEntry };

/**
 * Analyze a route module's static exports.
 *
 * This is the compiler-shaped slice of file routing: it reports what a module
 * exports without knowing what a route is. It is kept behind its own seam so
 * a compiler that already performs export analysis can provide it instead.
 */
export function analyzeModule(src: string): StaticExportEntry[] {
  const result = parseSync(src, fs.readFileSync(src, "utf-8"), { lang: "tsx" });
  const error = result.errors[0];
  if (error) throw new SyntaxError(`Failed to parse ${src}:\n${error.codeframe || error.message}`);

  return result.module.staticExports.flatMap(({ entries }) =>
    entries.filter(entry => !entry.isType && entry.exportName.kind !== "None")
  );
}

export function getExportName(entry: StaticExportEntry) {
  return entry.exportName.name ?? "default";
}

/**
 * Returns the export name only when it is backed by a same-named local
 * binding, i.e. it can be re-picked from the module without renaming.
 */
export function getLocalExportName(entry: StaticExportEntry) {
  const name = getExportName(entry);
  if (name === "default") return;
  return name === (entry.localName.name ?? entry.importName.name ?? name) ? name : undefined;
}
