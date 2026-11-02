// Run: npm test (from web/). Transpiles session-errors.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./session-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("what the server REFUSED ends the session; what it could not answer does not", () => {
  for (const status of [401, 403, 400]) assert.equal(m.isTransientAuthStatus(status), false, String(status));
  for (const status of [0, 429, 500, 502, 503]) assert.equal(m.isTransientAuthStatus(status), true, String(status));
  assert.equal(m.isTransientAuthStatus(-1), false, "an error that is not an API answer ends the session");
});

test("a revoked rider session (401 'Session has been revoked.') is ended at once, with no retry", () => {
  assert.deepEqual(m.refreshFailureAction(401, 0), { action: "end" });
  assert.deepEqual(m.refreshFailureAction(403, 2), { action: "end" });
  assert.deepEqual(m.refreshFailureAction(-1, 0), { action: "end" });
});

test("a blip is retried with growing delays, then given up on", () => {
  assert.deepEqual(m.refreshFailureAction(0, 0), { action: "retry", delayMs: 1500 });
  assert.deepEqual(m.refreshFailureAction(429, 1), { action: "retry", delayMs: 3000 });
  assert.deepEqual(m.refreshFailureAction(503, 2), { action: "retry", delayMs: 6000 });
  assert.deepEqual(m.refreshFailureAction(503, 3), { action: "end" });
  assert.equal(m.MAX_REFRESH_RETRIES, 3);
});
