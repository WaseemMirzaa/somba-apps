// Run: npm test (from web/). "Contact support" replaces every "Message the seller": a new ticket with the order or product filled in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const src = readFileSync(new URL("./contact-support.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { contactSupportHref, contactSupportPrefill } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const params = (href) => new URL(href, "http://x").searchParams;

test("with no context the link opens a blank ticket form", () => {
  assert.equal(contactSupportHref(), "/shop/support");
  assert.equal(contactSupportHref({}), "/shop/support");
});

test("an order link carries the order, a product link the product and its name", () => {
  assert.equal(contactSupportHref({ orderId: "o-1" }), "/shop/support?order=o-1");
  const p = params(contactSupportHref({ productId: "p 7", productName: "Café & thé" }));
  assert.equal(p.get("product"), "p 7");
  assert.equal(p.get("productName"), "Café & thé");
});

test("the form is prefilled from the product, the store or the order, in the reader's language", () => {
  const product = params(contactSupportHref({ productId: "p1", productName: "Kettle" }));
  const en = contactSupportPrefill(product, false, "https://shop.test");
  assert.equal(en.subject, "Question about Kettle");
  assert.equal(en.message, "Product: Kettle\nhttps://shop.test/shop/products/p1\n\n");
  const frr = contactSupportPrefill(product, true, "https://shop.test");
  assert.equal(frr.subject, "Question sur le produit Kettle");
  assert.match(frr.message, /^Produit: Kettle/);
  const store = contactSupportPrefill(params(contactSupportHref({ storeName: "Mama Shop" })), true);
  assert.equal(store.subject, "Question sur la boutique Mama Shop");
  assert.equal(store.message, "Boutique: Mama Shop\n\n");
  const order = contactSupportPrefill(params(contactSupportHref({ orderId: "SOM-1" })), false);
  assert.equal(order.orderParam, "SOM-1");
  assert.equal(order.subject, ""); // the page fills the subject once the order is loaded
  assert.deepEqual(contactSupportPrefill(params("/shop/support"), false), { subject: "", message: "", orderParam: null });
  assert.equal(contactSupportPrefill(params("/shop/support?subject=Hello"), false).subject, "Hello");
});

test("no shop page offers to message a seller any more; every old entry became Contact support", () => {
  const root = new URL("../", import.meta.url).pathname;
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) files.push(p);
    }
  })(root);
  const offenders = files.filter((f) => !f.endsWith("chat-closed-note.tsx") && /Message the seller|Écrire au vendeur|ContactSeller|chat:start|chat:send/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  for (const page of ["../app/shop/products/[id]/page.tsx", "../app/shop/stores/[id]/page.tsx", "../app/shop/orders/[id]/page.tsx", "../app/shop/orders/[id]/tracking/page.tsx"]) {
    assert.match(read(page), /<ContactSupport /, page);
  }
  assert.match(read("../app/shop/products/[id]/page.tsx"), /<ContactSupport [^>]*productId=\{product\.id\}/);
  assert.match(read("../app/shop/orders/[id]/page.tsx"), /<ContactSupport [^>]*orderId=\{order\.id\}/);
  // account page and header
  assert.match(read("../app/shop/account/page.tsx"), /href: "\/shop\/support"[^}]*Contact support/);
  const header = read("../components/landing/header.tsx");
  assert.match(header, /href="\/shop\/support"/);
  assert.doesNotMatch(header, /href="\/shop\/messages"/);
});

test("old chats are read-only: a closed note, no composer, and the support page keeps the prefill through sign-in", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const thread = read("../app/shop/messages/[id]/page.tsx");
  assert.match(thread, /<ChatClosedNote/);
  assert.doesNotMatch(thread, /<textarea|chat:send|PhotoPicker/);
  assert.match(read("../app/shop/messages/page.tsx"), /<ChatClosedNote/);
  assert.match(read("../components/shop/chat-closed-note.tsx"), /Messaging sellers is closed/);
  assert.match(read("../app/shop/support/page.tsx"), /next=\{qs \? `\/shop\/support\?\$\{qs\}`/);
});
