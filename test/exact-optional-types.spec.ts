import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import ts from "typescript";

/*
 * The project's own type tests compile without `exactOptionalPropertyTypes`
 * (the source doesn't opt in). Consumers may, so this compiles the fixture
 * under the flag through the compiler API and reports only the fixture's
 * diagnostics — the rest of the program is type-checked by `test:types`.
 */
describe("route definitions under exactOptionalPropertyTypes", () => {
  it("accepts trees with present-but-undefined optional properties", () => {
    const root = resolve(__dirname, "..");
    const fixture = resolve(root, "test/fixtures/exact-optional-routes.ts");
    const { config } = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);

    const program = ts.createProgram([fixture], {
      ...options,
      rootDir: undefined,
      noEmit: true,
      exactOptionalPropertyTypes: true
    });
    const source = program.getSourceFile(fixture)!;
    const diagnostics = [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source)
    ].map(d => {
      const { line } = source.getLineAndCharacterOfPosition(d.start ?? 0);
      return `${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
    });

    expect(diagnostics).toEqual([]);
  });
});
