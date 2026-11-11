// Run: npm test (from web/). The REST credential helper keeps the server's `messageFr` (string or list) on the error it throws,
// next to the unchanged English `message` and the HTTP status (docs/contracts/error-text.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./realtime/auth-api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let body = {};
globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => body });
const { authApi } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("a string messageFr is kept; the English message and status are unchanged", async () => {
  body = { statusCode: 400, message: "Invalid email or password.", messageFr: "E-mail ou mot de passe incorrect." };
  await assert.rejects(authApi.login("a@b.c", "x"), (e) => e.message === "Invalid email or password." && e.status === 400 && e.messageFr === "E-mail ou mot de passe incorrect.");
});

test("a list messageFr is joined like the list message", async () => {
  body = { statusCode: 400, message: ["email must be an email", "Password must be at least 8 characters."], messageFr: ["Saisissez un e-mail valide.", "Le mot de passe doit contenir au moins 8 caractères."] };
  await assert.rejects(authApi.login("a", "x"), (e) => e.message === "email must be an email Password must be at least 8 characters." && e.messageFr === "Saisissez un e-mail valide. Le mot de passe doit contenir au moins 8 caractères.");
});

test("no messageFr: nothing is invented", async () => {
  body = { statusCode: 400, message: "Something unknown." };
  await assert.rejects(authApi.login("a@b.c", "x"), (e) => e.messageFr === undefined && e.message === "Something unknown.");
});
