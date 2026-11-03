// Run: npm test (from web/). Cash on delivery is hidden everywhere in the portals while the `codEnabled` setting is not true.
// Transpiles cod-visibility.ts with the project's own `typescript`, and reads the menu / page sources for the COD guards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const { outputText } = ts.transpileModule(read("./cod-visibility.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { codOffered, withoutCodWhenOff } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("COD is offered only when the setting is exactly true", () => {
  assert.equal(codOffered(true), true);
  assert.equal(codOffered("true"), true);
  for (const v of [false, "false", "", undefined, null, 0, 1, "TRUE", "yes", "1", {}]) assert.equal(codOffered(v), false, `value ${JSON.stringify(v)}`);
});

test("menu entries marked cod disappear while COD is off and come back when it is on", () => {
  const items = [{ href: "/a" }, { href: "/cash", cod: true }, { href: "/b", cod: false }];
  assert.deepEqual(withoutCodWhenOff(items, false).map((i) => i.href), ["/a", "/b"]);
  assert.deepEqual(withoutCodWhenOff(items, true).map((i) => i.href), ["/a", "/cash", "/b"]);
  assert.notEqual(withoutCodWhenOff(items, true), items, "a copy, never the same array");
});

test("the warehouse menu marks its COD cash page, and only that page", () => {
  const src = read("./warehouse-access.ts");
  const flagged = [...src.matchAll(/\{ href: "([^"]+)"[^}]*\bcod: true[^}]*\}/g)].map((m) => m[1]);
  assert.deepEqual(flagged, ["/warehouse/reconcile"]);
  assert.match(src, /export function getWarehouseNav\(role: WarehouseStaffRole, codOffered = false\)/, "COD is hidden unless the caller says it is offered");
  assert.match(src, /withoutCodWhenOff\(WAREHOUSE_ROUTES, codOffered\)/);
});

test("the sidebar asks the platform setting before showing the COD cash page", () => {
  assert.match(read("../components/layout/dashboard-layout.tsx"), /getWarehouseNav\(warehouseRole, codOffered\)/);
  assert.match(read("../components/warehouse/warehouse-dashboard-view.tsx"), /withoutCodWhenOff\(quickLinks, codOffered\)/);
});

test("every page that showed COD checks the setting", () => {
  const guarded = {
    "../app/admin/finance/page.tsx": /codOffered && <StatCard title=\{fr \? "COD à encaisser"/,
    "../app/admin/analytics/page.tsx": /codOffered \? \(\s*<StatCard title=\{fr \? "COD à collecter"/,
    "../app/admin/orders/[id]/page.tsx": /\.\.\.\(codOffered \? \[\{ label: fr \? "COD à encaisser"/,
    "../app/warehouse/analytics/page.tsx": /codOffered && <StatCard title=\{fr \? "COD à encaisser"/,
    "../app/warehouse/riders/page.tsx": /codOffered \? \[\{ key: "cod"/,
    "../app/warehouse/riders/[id]/page.tsx": /codOffered \? \[\{ label: fr \? "COD encaissé"/,
    "../app/warehouse/tasks/[id]/page.tsx": /codOffered && task\.codAmountUsd > 0/,
    "../components/warehouse/leg-card.tsx": /codOffered && task\.codAmountUsd > 0/,
    "../components/warehouse/warehouse-dashboard-view.tsx": /\{codOffered && \(\s*<StatCard\s+title=\{fr \? "COD à encaisser"/,
    "../app/warehouse/settings/page.tsx": /settings\?\.codEnabled === "true"\s*\? \[/,
    "../app/shop/checkout/payment/page.tsx": /if \(settings\.codEnabled\) \{\s*list\.push\(\{ id: "cod"/,
    "../app/legal/shipping/page.tsx": /\{s\.codEnabled && \(/,
  };
  for (const [file, pattern] of Object.entries(guarded)) assert.match(read(file), pattern, `${file} must hide COD while it is off`);
});

test("the warehouse COD cash page sends everyone away while COD is off", () => {
  const src = read("../app/warehouse/reconcile/page.tsx");
  assert.match(src, /if \(codEnabled === false\) router\.replace\(base\)/);
  assert.match(src, /if \(codEnabled !== true\) return null;/);
});

test("admin settings: a read-only 'Not offered' line instead of the toggle, and no cap field, while COD is off", () => {
  const src = read("../app/admin/settings/page.tsx");
  assert.match(src, /const codOff = !codOffered\(saved\.codEnabled\)/);
  assert.match(src, /filter\(\(f\) => !\(codOff && f\.key === "codCapUsd"\)\)/);
  assert.match(src, /if \(codOff && f\.key === "codEnabled"\)/);
  assert.match(src, /Not offered/);
  assert.match(src, /Non proposé/);
});

test("no public page mentions cash on delivery as available", () => {
  assert.doesNotMatch(read("./product-landing.ts"), /cash on delivery|paiement à la livraison/i);
});
