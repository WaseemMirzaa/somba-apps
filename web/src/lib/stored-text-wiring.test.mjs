// Run: npm test (from web/). The #152 stored-text translations (docs/contracts/stored-text-i18n.md) reach every screen that shows the text,
// through the existing TranslatableText path (no tap): ticket subject and messages, return/dispute texts, exchange and replacement reasons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const has = (file, ...needles) => {
  const s = read(file);
  for (const n of needles) assert.ok(s.includes(n), `${file} should contain ${n}`);
};

test("the component knows every private kind of the contract", () => {
  const s = read("../components/shop/translatable-text.tsx");
  for (const k of ["support_ticket", "support_message", "dispute_message", "dispute_reason", "dispute_reply", "dispute_resolution", "exchange_reason", "exchange_reply", "replacement_reason", "replacement_reply"]) assert.ok(s.includes(`"${k}"`), k);
});

test("support tickets: customer, admin desk and seller show subjectI18n and messages[].textI18n", () => {
  for (const f of ["../app/shop/support/[id]/page.tsx", "../app/admin/support/[id]/page.tsx", "../app/seller/support/[id]/page.tsx"]) has(f, 'kind="support_message"', "i18n={m.textI18n}", "shownText(");
  has("../app/shop/support/page.tsx", "shownText(tk.subjectI18n");
  has("../app/admin/support/page.tsx", "shownText(row.subjectI18n");
  has("../app/seller/support/page.tsx", "shownText(tk.subjectI18n");
  const live = read("../lib/shop-live.ts") + read("../lib/admin-live.ts") + read("../lib/seller.tsx");
  assert.ok((live.match(/subjectI18n\?: TextI18n/g) ?? []).length >= 3);
  assert.ok((live.match(/textI18n\?: TextI18n/g) ?? []).length >= 3);
});

test("disputes and returns: reason, the earlier answer, the resolution and the thread (customer, admin, warehouse)", () => {
  has("../app/shop/returns/[id]/page.tsx", 'kind="dispute_reason"', 'kind="dispute_reply"', 'kind="dispute_resolution"', 'kind="dispute_message"', "i18n={d.reasonI18n}", "i18n={m.textI18n}");
  has("../components/admin/dispute-case.tsx", 'kind="dispute_reason"', 'kind="dispute_reply"', 'kind="dispute_resolution"', 'kind="dispute_message"');
  has("../app/warehouse/returns/[id]/page.tsx", 'kind="dispute_reason"', 'kind="dispute_resolution"');
  has("../app/admin/returns/page.tsx", "shownText(row.reasonI18n");
  has("../app/admin/disputes/page.tsx", "shownText(row.reasonI18n");
  has("../lib/realtime/types.ts", "reasonI18n?: TextI18n", "sellerReasonI18n?: TextI18n", "resolutionI18n?: TextI18n", "textI18n?: TextI18n");
});

test("exchanges and replacements: reason and the support decision note (customer, admin, warehouse)", () => {
  has("../components/shop/swap-status.tsx", 'kind="replacement_reason"', 'kind="replacement_reply"', 'kind="exchange_reason"', 'kind="exchange_reply"');
  has("../components/admin/after-sale-requests.tsx", '"replacement_reason"', '"exchange_reason"', '"replacement_reply"', '"exchange_reply"');
  has("../app/warehouse/replacements/[id]/page.tsx", 'kind="replacement_reason"', 'kind="replacement_reply"');
  has("../app/warehouse/exchanges/[id]/page.tsx", 'kind="exchange_reason"', 'kind="exchange_reply"');
  has("../lib/after-sale.ts", "reasonI18n?: TextI18n | null", "sellerReasonI18n?: TextI18n | null");
  has("../lib/warehouse-live.ts", "reasonI18n?: TextI18n | null", "sellerReasonI18n?: TextI18n | null");
});

test("the translated text always uses `auto`: nobody taps to see the other language", () => {
  const files = [
    "../app/shop/returns/[id]/page.tsx", "../components/admin/dispute-case.tsx", "../components/shop/swap-status.tsx",
    "../components/admin/after-sale-requests.tsx", "../app/warehouse/replacements/[id]/page.tsx", "../app/warehouse/exchanges/[id]/page.tsx",
    "../app/warehouse/returns/[id]/page.tsx", "../app/admin/chats/[id]/page.tsx",
  ];
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/<TranslatableText\b[^>]*>/g)) assert.match(m[0], /\bauto\b/, `${f}: ${m[0].slice(0, 80)}`);
  }
  const stored = read("../components/shop/translatable-text.tsx");
  assert.match(stored, /<TranslatableText kind=\{kind\} id=\{id\} auto /);
});
