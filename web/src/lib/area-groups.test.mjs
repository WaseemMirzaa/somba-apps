// Run: npm test (from web/). Transpiles area-groups.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./area-groups.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { groupCommunes } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const lukunga = { id: "d-luk", name: "Lukunga", nameEn: null };
const funa = { id: "d-fun", name: "Funa", nameEn: null };
const row = (id, district, extra = {}) => ({ id, level: "commune", parentId: district?.id ?? "city", district, ...extra });

test("geo:communes rows are grouped by their own district field, districts by name", () => {
  // The server sends served communes first, so the districts interleave.
  const rows = [row("gombe", lukunga), row("kalamu", funa), row("ngaliema", lukunga), row("bandal", funa)];
  const groups = groupCommunes(rows, false);
  assert.deepEqual(groups.map((g) => g.district.name), ["Funa", "Lukunga"]);
  assert.deepEqual(groups[0].areas.map((a) => a.id), ["kalamu", "bandal"]);
  assert.deepEqual(groups[1].areas.map((a) => a.id), ["gombe", "ngaliema"]);
});

test("a city without districts is one flat group; direct communes of a city with districts come last", () => {
  const flat = groupCommunes([row("a", null), row("b", null)], true);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].district, null);
  const mixed = groupCommunes([row("direct", null), row("gombe", lukunga)], true);
  assert.deepEqual(mixed.map((g) => g.district?.id ?? null), ["d-luk", null]);
});

test("old payload without the district field: it is taken from the parent district", () => {
  const rows = [{ id: "gombe", level: "commune", parentId: "d-luk" }, { id: "x", level: "commune", parentId: "city" }];
  const groups = groupCommunes(rows, false, new Map([["d-luk", lukunga]]));
  assert.deepEqual(groups.map((g) => g.district?.id ?? null), ["d-luk", null]);
});

test("rows that are not communes are ignored", () => {
  const groups = groupCommunes([row("gombe", lukunga), { id: "q", level: "quartier", parentId: "gombe" }], false);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].areas.length, 1);
});
