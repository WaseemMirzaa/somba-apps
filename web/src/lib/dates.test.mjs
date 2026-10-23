// Run: npm test (from web/). Pins dates.ts to the viewer's time zone.
// The web app has no TS test runner, so this transpiles dates.ts with the
// project's own `typescript` and imports the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./dates.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { localDay, localDateTime } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

// The time zone is set per assertion: Node re-reads TZ when it changes.
function inZone(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = prev;
  }
}

// SOM-821943591: placed 18:38 local in Karachi (+05:00); the API sends the UTC instant.
const placed = "2026-10-22T13:38:02.221Z";

test("an API instant shows the viewer's local time, not UTC", () => {
  inZone("Asia/Karachi", () => assert.equal(localDateTime(placed), "2026-10-22 18:38"));
  inZone("Africa/Kinshasa", () => assert.equal(localDateTime(placed), "2026-10-22 14:38"));
  inZone("UTC", () => assert.equal(localDateTime(placed), "2026-10-22 13:38"));
});

test("the local day follows the viewer's midnight", () => {
  const lateUtc = "2026-10-22T21:30:00.000Z"; // already 23 Oct in Karachi, still 22 Oct in New York
  inZone("Asia/Karachi", () => assert.equal(localDay(lateUtc), "2026-10-23"));
  inZone("America/New_York", () => assert.equal(localDay(lateUtc), "2026-10-22"));
});

test("Date objects and epoch numbers are formatted the same way", () => {
  inZone("Asia/Karachi", () => {
    assert.equal(localDateTime(new Date(placed)), "2026-10-22 18:38");
    assert.equal(localDateTime(Date.parse(placed)), "2026-10-22 18:38");
  });
});

test("a bare calendar date is never shifted", () => {
  inZone("America/New_York", () => {
    assert.equal(localDay("2026-10-22"), "2026-10-22");
    assert.equal(localDateTime("2026-10-22"), "2026-10-22");
  });
});

test("empty and unparseable values", () => {
  assert.equal(localDateTime(null), "");
  assert.equal(localDateTime(undefined), "");
  assert.equal(localDateTime(""), "");
  assert.equal(localDay("not a date"), "not a date");
});
