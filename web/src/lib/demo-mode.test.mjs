// Run: npm test (from web/). The demo quick login must be OFF unless NEXT_PUBLIC_DEMO_MODE is exactly "true".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./demo-mode.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });

async function demoModeWith(value) {
  const before = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (value === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
  else process.env.NEXT_PUBLIC_DEMO_MODE = value;
  try {
    // A unique query string gives each evaluation its own module instance.
    const mod = await import(`data:text/javascript,${encodeURIComponent(outputText + `\n// ${Math.random()}`)}`);
    return mod.DEMO_MODE;
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = before;
  }
}

test("demo login is off when the variable is missing", async () => {
  assert.equal(await demoModeWith(undefined), false);
});

test("demo login is off for empty, false, and anything but the word true", async () => {
  for (const v of ["", "false", "0", "1", "yes", "TRUE", "True", " true"]) assert.equal(await demoModeWith(v), false, v);
});

test("demo login is on only when the variable is exactly true", async () => {
  assert.equal(await demoModeWith("true"), true);
});

test("no other file reads the flag directly or defaults it on", () => {
  for (const f of ["../app/login/page.tsx", "../app/live/page.tsx", "../context/auth-context.tsx"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/NEXT_PUBLIC_DEMO_MODE/.test(s), `${f} must import DEMO_MODE from lib/demo-mode`);
    assert.ok(/from "@\/lib\/demo-mode"/.test(s), `${f} imports the shared flag`);
  }
});
