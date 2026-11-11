// Run: npm test (from web/). Transpiles checkout-attempt.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./checkout-attempt.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const timeout = () => new Error("operation has timed out");
const refusal = (msg) => Object.assign(new Error(msg), { raw: msg });

/** A fake socket: `create` and `lookup` decide the answers; every call is recorded. */
function server({ create, lookup }) {
  const calls = [];
  const request = async (event, body, opts) => {
    calls.push({ event, body, opts });
    if (event === "orders:create") return create(body);
    return lookup(body);
  };
  return { calls, request };
}

test("the key is a v4 UUID, new each time", () => {
  const a = m.newAttemptKey();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(m.newAttemptKey(), a);
});

test("sends the key and a long time limit", async () => {
  const s = server({ create: () => ({ id: "o1" }), lookup: () => assert.fail("no lookup") });
  const o = await m.placeOrderAttempt(s.request, { items: [] }, "k-123456789", false);
  assert.deepEqual(o, { id: "o1" });
  assert.equal(s.calls[0].body.clientRequestId, "k-123456789");
  assert.ok(s.calls[0].opts.timeoutMs >= 30_000);
});

test("no answer but placed: the order comes back, nothing sent twice", async () => {
  const s = server({ create: () => { throw timeout(); }, lookup: () => ({ state: "placed", order: { id: "o9" } }) });
  assert.deepEqual(await m.placeOrderAttempt(s.request, {}, "k-123456789", false), { id: "o9" });
  assert.deepEqual(s.calls.map((c) => c.event), ["orders:create", "orders:byRequest"]);
  assert.equal(s.calls[1].body.clientRequestId, "k-123456789");
});

test("no answer and still processing / never arrived / lookup failed: plain words, outcome kept open", async () => {
  for (const [lookup, en] of [
    [() => ({ state: "processing" }), /may still be going through/],
    [() => ({ state: "none" }), /did not reach us/],
    [() => { throw timeout(); }, /could not find out/],
  ]) {
    const s = server({ create: () => { throw timeout(); }, lookup });
    await assert.rejects(m.placeOrderAttempt(s.request, {}, "k-123456789", false), (e) => en.test(e.message) && m.outcomeUnknown(e));
  }
  const s = server({ create: () => { throw timeout(); }, lookup: () => ({ state: "processing" }) });
  await assert.rejects(m.placeOrderAttempt(s.request, {}, "k-123456789", true), /commande est peut-être en cours/);
});

test("a payment that failed is a definite answer (new key next time)", async () => {
  const s = server({ create: () => { throw timeout(); }, lookup: () => ({ state: "failed" }) });
  await assert.rejects(m.placeOrderAttempt(s.request, {}, "k-123456789", false), (e) => /did not go through/.test(e.message) && !m.outcomeUnknown(e));
});

test("a refusal the server sent is passed through and is definite", async () => {
  const s = server({ create: () => { throw refusal("This code is no longer available."); }, lookup: () => assert.fail("no lookup") });
  await assert.rejects(m.placeOrderAttempt(s.request, {}, "k-123456789", false), (e) => e.message === "This code is no longer available." && !m.outcomeUnknown(e));
});

test("the server saying an earlier request with this key is still running keeps the key", () => {
  const e = Object.assign(new Error("Your order is still being processed."), { raw: "x", code: "order_processing" });
  assert.equal(m.outcomeUnknown(e), true);
});

test("a timeout worded in French by socket-client is still 'no answer' (timedOut flag), a refusal never is", () => {
  const slowFr = Object.assign(new Error("Le serveur met trop de temps à répondre. Réessayez."), { timedOut: true });
  assert.equal(m.isNoAnswer(slowFr), true);
  assert.equal(m.outcomeUnknown(slowFr), true);
  assert.equal(m.isNoAnswer(refusal("Le serveur met trop de temps à répondre.")), false);
  assert.equal(m.outcomeUnknown(Object.assign(new Error("Connexion perdue."), { raw: "Socket not connected." })), true);
});
