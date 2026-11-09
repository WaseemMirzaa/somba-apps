// Run: npm test (from web/). Transpiles realtime/auth-api.ts with the project's own `typescript` and imports it with a
// fake browser (localStorage) and a fake server (fetch). The server ROTATES refresh tokens: every refresh answers a new
// one and the old one dies a few seconds later, so the portal must store the new one every time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./realtime/auth-api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};
let calls = [];
let n = 0;
/** A server that rotates: refresh token `r<k>` is answered with `r<k+1>`; `dead` tokens are refused with 401. */
const dead = new Set();
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  await new Promise((r) => setTimeout(r, 20));
  if (dead.has(body.refreshToken)) return { ok: false, status: 401, json: async () => ({ message: "Session has been revoked." }) };
  n++;
  return { ok: true, status: 200, json: async () => ({ user: { id: "u1" }, accessToken: `a${n}`, refreshToken: `r${n}` }) };
};
const { authApi, AuthApiError } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every refresh stores the NEW refresh token, and the next refresh sends it", async () => {
  store.clear();
  calls = [];
  authApi.saveTokens({ accessToken: "a0", refreshToken: "r0" });
  const first = await authApi.refreshStored();
  assert.equal(localStorage.getItem("somba.refreshToken"), first.refreshToken);
  assert.equal(localStorage.getItem("somba.accessToken"), first.accessToken);
  await authApi.refreshStored();
  assert.deepEqual(calls.map((c) => c.body.refreshToken), ["r0", first.refreshToken]);
});

test("callers that need a refresh at the same moment share ONE request (no second use of the same token)", async () => {
  store.clear();
  calls = [];
  authApi.saveTokens({ accessToken: "a0", refreshToken: "r0" });
  const [a, b, c] = await Promise.all([authApi.refreshStored(), authApi.refreshStored(), authApi.refreshStored()]);
  assert.equal(calls.length, 1);
  assert.equal(a.refreshToken, b.refreshToken);
  assert.equal(b.refreshToken, c.refreshToken);
  // and once it settled, the next one is a new request with the new token
  await authApi.refreshStored();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.refreshToken, a.refreshToken);
});

test("a refused refresh rejects with the status (the caller ends the session) and nothing stored is overwritten", async () => {
  store.clear();
  authApi.saveTokens({ accessToken: "aX", refreshToken: "rX" });
  dead.add("rX");
  await assert.rejects(authApi.refreshStored(), (e) => e instanceof AuthApiError && e.status === 401);
  assert.equal(localStorage.getItem("somba.refreshToken"), "rX");
  dead.delete("rX");
});

test("with no stored refresh token it rejects with 401 and calls nobody", async () => {
  store.clear();
  calls = [];
  await assert.rejects(authApi.refreshStored(), (e) => e instanceof AuthApiError && e.status === 401);
  assert.equal(calls.length, 0);
});
