// Run: npm test (from web/). Transpiles rider-history.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-history.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const task = (orderId, o = {}) => ({ id: orderId, orderId, deliveredAt: null, updatedAt: null, createdAt: "2026-10-01T08:00:00", ...o });
const f = (o = {}) => ({ query: "", from: "", to: "", ...o });

test("a reference matches whatever the case, spaces or #", () => {
  assert.equal(m.matchesReference("SOM-1042", "som-10"), true);
  assert.equal(m.matchesReference("SOM-1042", " #1042 "), true);
  assert.equal(m.matchesReference("SOM-1042", "1043"), false);
  assert.equal(m.matchesReference("SOM-1042", ""), true);
  assert.equal(m.matchesReference("SOM-1042", "   "), true);
});

test("days are inclusive at both ends, whatever the hour, and either end may be open", () => {
  const late = "2026-10-20T23:59:00";
  assert.equal(m.inDayRange(late, "2026-10-20", "2026-10-20"), true);
  assert.equal(m.inDayRange(late, "2026-10-21", ""), false);
  assert.equal(m.inDayRange(late, "", "2026-10-19"), false);
  assert.equal(m.inDayRange(late, "2026-10-01", "2026-10-31"), true);
  assert.equal(m.inDayRange(null, "", ""), true);
  assert.equal(m.inDayRange(null, "2026-10-01", ""), false, "no date cannot be inside a range");
  assert.equal(m.inDayRange("not a date", "", "2026-10-31"), false);
});

test("a finished leg is dated by delivery, else last touched, else creation", () => {
  assert.equal(m.finishedAt({ deliveredAt: "a", updatedAt: "b", createdAt: "c" }), "a");
  assert.equal(m.finishedAt({ updatedAt: "b", createdAt: "c" }), "b");
  assert.equal(m.finishedAt({ createdAt: "c" }), "c");
  assert.equal(m.finishedAt({}), null);
  assert.equal(m.runFinishedAt({ closedAt: "x", arrivedAt: "y" }), "x");
  assert.equal(m.runFinishedAt({ arrivedAt: "y", dispatchedAt: "z" }), "y");
  assert.equal(m.runFinishedAt({ createdAt: "w" }), "w");
});

test("tasks: the search and the days combine", () => {
  const all = [
    task("SOM-1001", { deliveredAt: "2026-10-20T10:00:00" }),
    task("SOM-1002", { deliveredAt: "2026-10-21T10:00:00" }),
    task("SOM-2001", { updatedAt: "2026-10-21T11:00:00" }), // a failure has no deliveredAt
  ];
  assert.equal(m.filterFinishedTasks(all, f()).length, 3);
  assert.deepEqual(m.filterFinishedTasks(all, f({ query: "som-100" })).map((t) => t.id), ["SOM-1001", "SOM-1002"]);
  assert.deepEqual(m.filterFinishedTasks(all, f({ from: "2026-10-21", to: "2026-10-21" })).map((t) => t.id), ["SOM-1002", "SOM-2001"]);
  assert.deepEqual(m.filterFinishedTasks(all, f({ query: "2001", from: "2026-10-21", to: "2026-10-22" })).map((t) => t.id), ["SOM-2001"]);
  assert.deepEqual(m.filterFinishedTasks(all, f({ query: "nope" })), []);
});

test("runs are found by their own reference or by the order reference of a parcel inside", () => {
  const r1 = { id: "r1", reference: "TR-0007", closedAt: "2026-10-20T12:00:00" };
  const r2 = { id: "r2", reference: "TR-0008", closedAt: "2026-10-22T12:00:00" };
  const refs = (r) => (r.id === "r1" ? ["SOM-3001"] : []);
  assert.deepEqual(m.filterFinishedRuns([r1, r2], refs, f({ query: "tr-0008" })).map((r) => r.id), ["r2"]);
  assert.deepEqual(m.filterFinishedRuns([r1, r2], refs, f({ query: "3001" })).map((r) => r.id), ["r1"]);
  assert.deepEqual(m.filterFinishedRuns([r1, r2], refs, f({ from: "2026-10-22", to: "2026-10-22" })).map((r) => r.id), ["r2"]);
  assert.equal(m.filterFinishedRuns([r1, r2], refs, f()).length, 2);
});

test("isFiltering tells an untouched filter from a used one; dayKey is the viewer's calendar day", () => {
  assert.equal(m.isFiltering(m.EMPTY_HISTORY_FILTER), false);
  assert.equal(m.isFiltering(f({ query: "  " })), false);
  assert.equal(m.isFiltering(f({ query: "a" })), true);
  assert.equal(m.isFiltering(f({ to: "2026-10-01" })), true);
  assert.equal(m.dayKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});
