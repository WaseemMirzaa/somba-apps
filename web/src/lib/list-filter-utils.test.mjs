// Run: npm test (from web/). applyListFilters finds an order by its old SOM- reference too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };
const fields = ts.transpileModule(readFileSync(new URL("./i18n-fields.ts", import.meta.url), "utf8"), opts).outputText;
const fieldsUrl = `data:text/javascript,${encodeURIComponent(fields)}`;
const utils = ts
  .transpileModule(readFileSync(new URL("./list-filter-utils.ts", import.meta.url), "utf8"), opts)
  .outputText.replace('"@/lib/i18n-fields"', JSON.stringify(fieldsUrl));
const { applyListFilters } = await import(`data:text/javascript,${encodeURIComponent(utils)}`);

const rows = [
  { id: "KOM-220126447", customer: "Aïcha" },
  { id: "KOM-999", customer: "Bob" },
];
const f = (search) => ({ search, fromDate: "", toDate: "", status: "" });
const cfg = { searchFields: ["id", "customer"] };

test("applyListFilters: SOM- input finds the KOM- reference, any case, with or without #", () => {
  for (const q of ["SOM-220126447", "som-220126447", "#SOM-220126447", "KOM-220126447", "#kom-220126447", "220126447"]) {
    assert.deepEqual(applyListFilters(rows, f(q), cfg).map((r) => r.id), ["KOM-220126447"], q);
  }
});

test("applyListFilters: other searches are unchanged", () => {
  assert.equal(applyListFilters(rows, f(""), cfg).length, 2);
  assert.deepEqual(applyListFilters(rows, f("aicha"), cfg).map((r) => r.id), ["KOM-220126447"]);
  assert.equal(applyListFilters(rows, f("SOMBA"), cfg).length, 0);
});
