// Run: npm test (from web/). Transpiles rider-profile.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-profile.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("name: 2 to 80 characters once trimmed", () => {
  assert.equal(m.isValidName("Jo"), true);
  assert.equal(m.isValidName(" J "), false);
  assert.equal(m.isValidName("x".repeat(80)), true);
  assert.equal(m.isValidName("x".repeat(81)), false);
  assert.equal(m.isValidName(""), false);
});

test("phone: optional, and a real-looking number when typed (the server's rule)", () => {
  for (const ok of ["", "   ", "+243 81 234 5678", "(081) 234-5678", "0812345678"]) assert.equal(m.isValidPhone(ok), true, ok);
  for (const bad of ["123", "call me", "abc 1234567", "+".repeat(3), "1".repeat(21)]) assert.equal(m.isValidPhone(bad), false, bad);
});

test("problems are explained in the rider's language, and nothing is wrong with good values", () => {
  const en = m.profileProblems("J", "x", false);
  assert.equal(en.name, "Enter your name (2 to 80 characters).");
  assert.equal(en.phone, "Enter a valid phone number.");
  const fr = m.profileProblems("J", "x", true);
  assert.equal(fr.name, "Saisissez votre nom (2 à 80 caractères).");
  assert.equal(fr.phone, "Saisissez un numéro de téléphone valide.");
  const ok = m.profileProblems("Jean R.", "", false);
  assert.deepEqual(ok, { name: null, phone: null });
  assert.equal(m.hasProblems(ok), false);
  assert.equal(m.hasProblems(en), true);
});

test("me:update carries the name and phone only (never the e-mail, role or warehouse); a blank phone clears it", () => {
  assert.deepEqual(m.profilePatch("  Jean R. ", " +243 81 234 5678 "), { name: "Jean R.", phone: "+243 81 234 5678" });
  assert.deepEqual(m.profilePatch("Jean", "   "), { name: "Jean", phone: null });
  assert.deepEqual(Object.keys(m.profilePatch("Jean", "")).sort(), ["name", "phone"]);
});

test("only a push about the signed-in rider is shown (another account, or a role change, is ignored)", () => {
  assert.equal(m.isSameAccount({ id: "r1" }, { id: "r1", role: "rider" }), true);
  assert.equal(m.isSameAccount({ id: "r1" }, { id: "r2", role: "rider" }), false);
  assert.equal(m.isSameAccount({ id: "r1" }, { id: "r1", role: "admin" }), false);
  assert.equal(m.isSameAccount(null, { id: "r1", role: "rider" }), false);
  assert.equal(m.isSameAccount({ id: "r1" }, null), false);
});

test("password: each problem is named (current, 8 characters, different from the current one, confirmation)", () => {
  const none = m.passwordProblems("Somba@2026", "Another@2026", "Another@2026", false);
  assert.deepEqual(none, { current: null, next: null, again: null });
  assert.equal(m.hasProblems(none), false);
  const empty = m.passwordProblems("", "short", "other", false);
  assert.equal(empty.current, "Enter your current password.");
  assert.equal(empty.next, "At least 8 characters.");
  assert.equal(empty.again, "The two passwords do not match.");
  assert.equal(m.passwordProblems("Somba@2026", "Somba@2026", "Somba@2026", false).next, "Choose a password different from the current one.");
  const fr = m.passwordProblems("", "short", "other", true);
  assert.deepEqual([fr.current, fr.next, fr.again], ["Saisissez votre mot de passe actuel.", "8 caractères au minimum.", "Les deux mots de passe sont différents."]);
});
