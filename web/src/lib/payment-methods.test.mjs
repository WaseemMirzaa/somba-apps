// Run: npm test (from web/). Transpiles payment-methods.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = readFileSync(new URL("./payment-methods.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { PAYMENT_METHODS, PAYMENT_METHOD_IDS, paymentMethodId, paymentMethodLabel } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every method the API can carry has a label in both languages", () => {
  assert.deepEqual([...PAYMENT_METHOD_IDS].sort(), ["airtel_money", "cod", "orange_money", "stripe_card", "vodacom_mpesa", "wallet"]);
  for (const id of PAYMENT_METHOD_IDS) {
    assert.ok(PAYMENT_METHODS[id].en.trim(), `${id} has an English label`);
    assert.ok(PAYMENT_METHODS[id].fr.trim(), `${id} has a French label`);
  }
});

test("the French order page names the wallet 'Portefeuille Somba' (bug 3)", () => {
  assert.equal(paymentMethodLabel("wallet", true), "Portefeuille Somba");
  assert.equal(paymentMethodLabel("wallet", false), "Somba wallet");
});

test("each method is translated, not only cash on delivery and card", () => {
  assert.equal(paymentMethodLabel("cod", true), "Paiement à la livraison");
  assert.equal(paymentMethodLabel("cod", false), "Cash on delivery");
  assert.equal(paymentMethodLabel("stripe_card", true), "Carte");
  assert.equal(paymentMethodLabel("stripe_card", false), "Card");
  for (const id of ["airtel_money", "orange_money", "vodacom_mpesa"]) {
    assert.equal(paymentMethodLabel(id, true), paymentMethodLabel(id, false), "a network keeps its brand name");
  }
  assert.equal(paymentMethodLabel("vodacom_mpesa", true), "Vodacom M-Pesa");
});

test("older display names read as the method they stand for", () => {
  assert.equal(paymentMethodId("COD"), "cod");
  assert.equal(paymentMethodId("Card"), "stripe_card");
  assert.equal(paymentMethodId("Wallet"), "wallet");
  assert.equal(paymentMethodLabel("Wallet", true), "Portefeuille Somba");
  assert.equal(paymentMethodLabel("Card", true), "Carte");
});

test("a method we do not know is shown readable, an empty one as a dash", () => {
  assert.equal(paymentMethodId("bank_transfer"), null);
  assert.equal(paymentMethodLabel("bank_transfer", true), "bank transfer");
  assert.equal(paymentMethodLabel("", true), "—");
  assert.equal(paymentMethodLabel(null, false), "—");
  assert.equal(paymentMethodLabel(undefined, false), "—");
});

test("there is ONE map: no other file spells the method labels out again", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !p.endsWith("payment-methods.ts") && /vodacom_mpesa\s*:\s*[{"]/.test(readFileSync(p, "utf8"))) offenders.push(p.slice(here.length));
    }
  };
  walk(join(here, ".."));
  assert.deepEqual(offenders, [], "use paymentMethodLabel from @/lib/payment-methods");
});
