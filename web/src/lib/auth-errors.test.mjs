// Run: npm test (from web/). Transpiles auth-errors.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./auth-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { authErrorText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("known API messages are translated to French and left alone in English", () => {
  const bad = new Error("Invalid email or password.");
  assert.equal(authErrorText(bad, true), "E-mail ou mot de passe incorrect.");
  assert.equal(authErrorText(bad, false), "Invalid email or password.");
  assert.equal(authErrorText("An account with this email already exists.", true), "Un compte existe déjà avec cet e-mail.");
  assert.equal(authErrorText(new Error("Invalid or expired link."), true), "Lien invalide ou expiré.");
  assert.equal(authErrorText(new Error("Password must be at least 8 characters."), true), "Le mot de passe doit contenir au moins 8 caractères.");
});

test("matching ignores the trailing full stop and the case", () => {
  assert.equal(authErrorText(new Error("invalid email or password"), true), "E-mail ou mot de passe incorrect.");
  assert.equal(authErrorText(new Error("  Incorrect code  "), true), "Code incorrect.");
});

test("network failures and rate limits read the same in both languages' own words", () => {
  assert.match(authErrorText(new TypeError("Failed to fetch"), true), /Impossible de joindre le serveur/);
  assert.match(authErrorText(new TypeError("Failed to fetch"), false), /Cannot reach the server/);
  assert.match(authErrorText(new Error("ThrottlerException: Too Many Requests"), true), /Trop de tentatives/);
  assert.match(authErrorText(new Error("Too Many Requests"), false), /Too many attempts/);
});

test("validation messages from the API", () => {
  assert.equal(authErrorText(new Error("email must be an email"), true), "Saisissez une adresse e-mail valide.");
  assert.equal(authErrorText(new Error("email must be an email password must be a string"), false), "Enter a valid email address.");
  assert.equal(authErrorText(new Error("Request failed (502)"), true), "La requête a échoué (502).");
  assert.equal(authErrorText(new Error("Request failed (502)"), false), "Request failed (502)");
});

test("an unknown message is passed through, an empty one gets a generic text", () => {
  assert.equal(authErrorText(new Error("Some brand new server message."), true), "Some brand new server message.");
  assert.equal(authErrorText(undefined, true), "Une erreur est survenue. Réessayez.");
  assert.equal(authErrorText(null, false), "Something went wrong. Please try again.");
});
