// Run: npm test (from web/). The cart must not follow the browser from one account to the next.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./cart-merge.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { mergeCartLines, signedOut } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const line = (id, qty, variant = "Default") => ({ id, variant, qty });

test("merge keeps one line per product and option, the larger quantity wins", () => {
  const out = mergeCartLines([line("a", 1), line("b", 3)], [line("a", 2), line("b", 1), line("c", 1)]);
  assert.deepEqual(out.map((l) => [l.id, l.qty]), [["a", 2], ["b", 3], ["c", 1]]);
});

test("two options of one product stay two lines", () => {
  const out = mergeCartLines([line("a", 1, "Colour: Black")], [line("a", 1, "Colour: Blue")]);
  assert.equal(out.length, 2);
});

test("a guest cart survives the sign-in merge", () => {
  assert.deepEqual(mergeCartLines([line("a", 2)], []).map((l) => l.qty), [2]);
});

test("signing out drops the browser's cart, a guest or a connection blip does not", () => {
  assert.equal(signedOut("user-1", null), true);
  assert.equal(signedOut(null, null), false); // a guest browsing
  assert.equal(signedOut(null, "user-1"), false); // signing in
  assert.equal(signedOut("user-1", "user-1"), false); // same account, e.g. the socket reconnected
  assert.equal(signedOut("user-1", "user-2"), false); // handled by the merge, logout always passes through null
});
