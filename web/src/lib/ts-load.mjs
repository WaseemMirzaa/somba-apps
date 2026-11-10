// Test helper (not a test: `npm test` runs only *.test.mjs). Loads a TypeScript module of src/lib with the project's own
// `typescript`, following its runtime imports of other "@/lib/…" modules (type-only imports are dropped by the transpiler).
import { readFileSync } from "node:fs";
import ts from "typescript";

function build(name) {
  const src = readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8");
  let { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  outputText = outputText.replace(/from\s+"@\/lib\/([\w-]+)"/g, (_m, dep) => `from "data:text/javascript,${encodeURIComponent(build(dep))}"`);
  return outputText;
}

/** `await loadTs("split-delivery")` -> the module's exports. */
export async function loadTs(name) {
  return import(`data:text/javascript,${encodeURIComponent(build(name))}`);
}
