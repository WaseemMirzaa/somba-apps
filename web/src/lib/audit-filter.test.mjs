// Run: npm test (from web/). Transpiles audit-filter.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./audit-filter.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { EMPTY_AUDIT_FILTERS, AUDIT_PAGE_SIZE, auditRequest, hasAuditFilters, auditRangeError } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("no filter asks for the first page only", () => {
  assert.deepEqual(auditRequest(EMPTY_AUDIT_FILTERS), { limit: AUDIT_PAGE_SIZE, offset: 0 });
  assert.equal(hasAuditFilters(EMPTY_AUDIT_FILTERS), false);
});

test("only filled-in filters are sent, trimmed, with the page", () => {
  const f = { ...EMPTY_AUDIT_FILTERS, action: "user.suspend", actor: "  ada ", from: "2026-06-01", to: "2026-06-30", role: "admin" };
  assert.deepEqual(auditRequest(f, 100), { limit: 50, offset: 100, action: "user.suspend", actor: "ada", from: "2026-06-01", to: "2026-06-30", role: "admin" });
  assert.equal(hasAuditFilters(f), true);
  assert.equal(hasAuditFilters({ ...EMPTY_AUDIT_FILTERS, q: "   " }), false);
});

test("a backwards date range is caught in both languages before asking", () => {
  const f = { ...EMPTY_AUDIT_FILTERS, from: "2026-06-30", to: "2026-06-01" };
  assert.match(auditRangeError(f, false), /start date is after the end date/);
  assert.match(auditRangeError(f, true), /début est après la date de fin/);
  assert.equal(auditRangeError({ ...f, to: "2026-06-30" }, false), null);
  assert.equal(auditRangeError({ ...EMPTY_AUDIT_FILTERS, from: "2026-06-30" }, false), null);
});
