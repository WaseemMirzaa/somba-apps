// A followed store's deal and promotion notices open the page they describe (mirrors api/src/notifications/links.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./notice-links.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { noticeHref } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const href = (type, entityId) => noticeHref({ type, entityId, link: undefined }, "shop");

test("a deal opens the deals page; a promotion opens the store (entityId is <store id>:<campaign or coupon id>)", () => {
  assert.equal(href("flash", "fs1"), "/shop/deals");
  assert.equal(href("campaign", "st1:c1"), "/shop/stores/st1");
  assert.equal(href("promo", "st1:pr1"), "/shop/stores/st1");
  assert.equal(href("store", "p1"), "/shop/products/p1");
});

test("without a store in the id it falls back to the notifications page; the server's own link always wins", () => {
  assert.equal(href("promo", "pr1"), "/shop/notifications");
  assert.equal(href("campaign", null), "/shop/notifications");
  assert.equal(noticeHref({ type: "promo", entityId: "st1:p", link: "/shop/stores/st1" }, "shop"), "/shop/stores/st1");
  // the seller's own pages for the same types are unchanged
  assert.equal(noticeHref({ type: "flash", entityId: "fs1", link: undefined }, "seller"), "/seller/flash-sales");
  assert.equal(noticeHref({ type: "campaign", entityId: "c1", link: undefined }, "seller"), "/seller/promotions/c1");
});
