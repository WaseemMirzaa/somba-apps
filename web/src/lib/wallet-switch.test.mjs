// Run: npm test (from web/). The wallet switch reaches the shop as the public setting `walletEnabled` (default on).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./shop-live.ts", import.meta.url), "utf8");

test("walletEnabled is on unless the server says 'false' (a server that never stored it keeps the wallet)", () => {
  assert.match(src, /walletEnabled: raw\.walletEnabled !== "false"/);
  assert.match(src, /EMPTY_SETTINGS[\s\S]*walletEnabled: true/);
});

test("settings:updated carries it live: the stored value wins, the current one is kept when the payload omits it", () => {
  assert.match(src, /walletEnabled: raw\.walletEnabled \?\? \(cur\.walletEnabled \? "true" : "false"\)/);
});

test("the shop screens that show a wallet entry read the switch", () => {
  for (const f of ["../app/shop/account/page.tsx", "../app/shop/checkout/payment/page.tsx", "../components/shop/request-form.tsx", "../components/seller/plan-checkout.tsx"]) {
    const s = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(s, /walletOn|walletEnabled/, f);
  }
  const pay = readFileSync(new URL("../app/shop/checkout/payment/page.tsx", import.meta.url), "utf8");
  assert.match(pay, /\.\.\.\(walletOn\s*\?/, "the wallet tile is only listed while the wallet is on");
});
