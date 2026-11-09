// Run: npm test (from web/). The admin "Reset password" / "Edit e-mail" words exist in both languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./staff-account.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { staffActionText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every string and sentence exists in English and French, and differs", () => {
  const en = staffActionText(false);
  const fr = staffActionText(true);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const k of Object.keys(en)) {
    if (typeof en[k] === "function") {
      assert.notEqual(en[k]("Marc", "m@x.test"), fr[k]("Marc", "m@x.test"), k);
    } else assert.notEqual(en[k], fr[k], k);
  }
});

test("the re-issue warning says the password is shown once and is not kept", () => {
  assert.match(staffActionText(false).issuedNote, /shown once/);
  assert.match(staffActionText(true).issuedNote, /qu'une fois/);
  assert.match(staffActionText(false).resetBody, /without the password/);
});
