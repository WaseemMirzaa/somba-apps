// Run: npm test (from web/). The warehouse operations screens: they ask for events the API really serves, show errors and
// confirmations, speak French, and never show pay (riders are salaried).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const lib = read("./warehouse-ops.ts");
const gateway = read("../../../api/src/logistics/warehouse-ops.gateway.ts");
const settingsCard = read("../components/warehouse/hub-ops-settings.tsx");
const perf = read("../components/warehouse/ops-performance.tsx");
const dialog = read("../components/warehouse/return-to-seller-dialog.tsx");
const aged = read("../app/warehouse/aged/page.tsx");
const settingsPage = read("../app/warehouse/settings/page.tsx");
const analyticsPage = read("../app/warehouse/analytics/page.tsx");

test("every event the data layer asks for is served by the API's warehouse operations gateway", () => {
  // "hubSettings:updated" is the push the screens listen to, not a request.
  const asked = [...lib.matchAll(/"((?:hubSettings|aged|analytics|warehouseOps):[A-Za-z]+)"/g)].map((m) => m[1]).filter((e) => e !== "hubSettings:updated");
  const served = [...gateway.matchAll(/@SubscribeMessage\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(asked)].sort(), ["aged:returnToSeller", "aged:summary", "analytics:legs", "hubSettings:get", "hubSettings:update"]);
  for (const ev of asked) assert.ok(served.includes(ev), `${ev} is not served`);
});

test("the settings page shows the warehouse's own settings card, and no longer says hours, batch size and auto-assignment are not configurable", () => {
  assert.match(settingsPage, /<HubOpsSettingsCard \/>/);
  assert.doesNotMatch(settingsPage, /not configurable yet|ne sont pas encore configurables/);
});

test("the settings card saves through the server, validates first, and answers every outcome with a message", () => {
  assert.match(settingsCard, /formProblem\(form, fr\)/);
  assert.match(settingsCard, /saveHubOpsSettings\(hubId, patch\)/);
  assert.match(settingsCard, /toast\(fr \? "Réglages de l'entrepôt enregistrés" : "Warehouse settings saved"\)/);
  assert.match(settingsCard, /toast\(m, "error"\)/);
  assert.match(settingsCard, /canEdit/); // the server decides who edits; others get the read-only view
  assert.match(settingsCard, /Riders do not accept or refuse/);
  assert.match(settingsCard, /Les livreurs n'acceptent ni ne refusent/);
  // label-only primary button
  assert.match(settingsCard, /\{busy \? "…" : fr \? "Enregistrer" : "Save"\}/);
});

test("the aged board shows the alert level, offers Return to seller only to supervisors, and confirms before sending a parcel back", () => {
  assert.match(aged, /useAgedSummary\(canAssign \|\| isAdmin\)/);
  assert.match(aged, /canReturnLeg\(t\)/);
  assert.match(aged, /role === "admin" \|\| role === "admin_operations"/); // only these two admins may send a parcel back, as the server decides
  assert.match(aged, /Retourner au vendeur/);
  assert.match(aged, /<ReturnToSellerDialog/);
  assert.match(dialog, /returnToSeller\(parcel\.id\)/);
  assert.match(dialog, /toast\(m, "error"\)/);
  assert.match(dialog, /n'est ni annulée ni remboursée/); // the desk never touches money
  assert.match(dialog, /is not cancelled or refunded here/);
});

test("the performance section has a date range, shows counts and times, and the old loaded-parcels rider table is gone", () => {
  assert.match(analyticsPage, /<OpsPerformance \/>/);
  assert.doesNotMatch(analyticsPage, /riderRows/);
  assert.match(perf, /type="date"/);
  assert.match(perf, /rangeProblem\(draft\.from, draft\.to, fr\)/);
  assert.match(perf, /successRatePct/);
  assert.match(perf, /Delivered on time/);
  assert.match(perf, /Livrées à l'heure/);
});

test("nothing in the warehouse operations screens shows pay", () => {
  for (const src of [settingsCard, perf, dialog, lib]) assert.doesNotMatch(src, /earning|salary|wage|commission|payout|perTask|Usd\b|formatCurrency/i);
});
