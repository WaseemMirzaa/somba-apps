// Run: npm test (from web/). Transpiles quote-text.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./quote-text.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const q = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const hop = (from, to, transitHours) => ({ fromHubId: from, fromHubName: `Entrepôt ${from}`, toHubId: to, toHubName: `Entrepôt ${to}`, transitHours });

test("fallback note names the covering warehouse and the one that delivers (EN/FR)", () => {
  const quote = { fallback: "city", coveringHubName: "Entrepôt Limete", destinationHubName: "Entrepôt Kinshasa" };
  assert.equal(q.quoteFallbackNote(quote, false), "Entrepôt Limete has no rider available right now — delivered from Entrepôt Kinshasa.");
  assert.equal(q.quoteFallbackNote(quote, true), "Entrepôt Limete n'a pas de livreur disponible pour le moment — livraison depuis Entrepôt Kinshasa.");
  assert.equal(q.quoteFallbackNote({ ...quote, fallback: "nearest" }, false), "Entrepôt Limete has no rider available right now — delivered from Entrepôt Kinshasa.");
});

test("fallback note: destination taken from destinationHub on an older payload; generic text without names", () => {
  const withHub = { fallback: "city", coveringHubName: "Entrepôt Limete", destinationHub: { name: "Entrepôt Kinshasa" } };
  assert.match(q.quoteFallbackNote(withHub, false), /delivered from Entrepôt Kinshasa/);
  const bare = q.quoteFallbackNote({ fallback: "nearest" }, false);
  assert.match(bare, /^The warehouse covering your area has no rider available right now/);
  assert.match(q.quoteFallbackNote({ fallback: "city" }, true), /^L'entrepôt qui couvre votre zone n'a pas de livreur/);
});

test("fallback note: no riders anywhere, and none when nothing falls back", () => {
  assert.match(q.quoteFallbackNote({ fallback: "no_riders" }, false), /^No warehouse nearby has riders available/);
  assert.match(q.quoteFallbackNote({ fallback: "no_riders" }, true), /^Aucun entrepôt proche/);
  assert.equal(q.quoteFallbackNote({ fallback: null }, false), null);
  assert.equal(q.quoteFallbackNote(null, false), null);
});

test("the pickup side of the fallback", () => {
  const o = { fallback: "city", coveringHubName: "Entrepôt Limete", hubName: "Entrepôt Kinshasa" };
  assert.equal(q.originFallbackNote(o, false), "Entrepôt Limete has no rider available right now — collected by Entrepôt Kinshasa.");
  assert.equal(q.originFallbackNote(o, true), "Entrepôt Limete n'a pas de livreur disponible pour le moment — collecte par Entrepôt Kinshasa.");
  assert.equal(q.originFallbackNote({ ...o, fallback: null }, false), null);
  assert.equal(q.originFallbackNote({ ...o, hubName: "Entrepôt Limete" }, false), null);
});

test("per-hop transit comes from origins[].hops[] (and no hop carries a price)", () => {
  const quote = {
    origins: [{ sellerId: "s1", areaName: "Limete", areaNameEn: "Limete", hops: [hop("L", "K", 4), hop("K", "W", 24)], transitHours: 28 }],
  };
  const [route] = q.quoteRoutes(quote, false);
  assert.equal(route.hops.length, 2);
  assert.deepEqual(route.hops[0], { from: "Entrepôt L", to: "Entrepôt K", transitHours: 4 });
  assert.deepEqual(route.hops[1], { from: "Entrepôt K", to: "Entrepôt W", transitHours: 24 });
  assert.equal(route.transitHours, 28);
  assert.equal(q.hopFigures, undefined);
  assert.equal(q.standardHopFee, undefined);
});

test("a route sums its hop transit when the origin does not say; two routes are labelled by their seller's area", () => {
  const sum = q.quoteRoutes({ origins: [{ hops: [hop("L", "K", 4), hop("K", "W", 24)] }] }, false);
  assert.equal(sum[0].transitHours, 28);
  const labelled = q.quoteRoutes({ origins: [{ areaName: "Limète", areaNameEn: "Limete", hops: [hop("L", "K", 4)] }, { areaName: "Gombe", hops: [hop("G", "K", 2)] }] }, false);
  assert.deepEqual(labelled.map((r) => r.label), ["Limete", "Gombe"]);
  assert.deepEqual(q.quoteRoutes({ origins: [{ areaName: "Limète", areaNameEn: "Limete", hops: [hop("L", "K", 4)] }, { areaName: "Gombe", hops: [hop("G", "K", 2)] }] }, true).map((r) => r.label), ["Limète", "Gombe"]);
});

test("old payloads: no transit and no cost per hop, or one chain on the quote", () => {
  const oldOrigins = q.quoteRoutes({ origins: [{ hops: [{ fromHubId: "L", fromHubName: "Entrepôt L", toHubId: "K", toHubName: "Entrepôt K" }] }] }, false);
  assert.equal(oldOrigins[0].hops[0].transitHours, null);
  assert.equal(oldOrigins[0].transitHours, null);
  const flat = q.quoteRoutes({ hops: [hop("L", "K", 4)] }, false);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].hops[0].transitHours, 4);
  assert.deepEqual(q.quoteRoutes({ origins: [{ hops: [] }] }, false), []);
  assert.deepEqual(q.quoteRoutes(null, false), []);
});

test("transit time is written as people say it", () => {
  assert.equal(q.formatTransit(4, false), "4 h");
  assert.equal(q.formatTransit(0.5, false), "30 min");
  assert.equal(q.formatTransit(72, false), "3 d");
  assert.equal(q.formatTransit(72, true), "3 j");
  assert.equal(q.formatTransit(60, true), "2 j 12 h");
  assert.equal(q.formatTransit(null, true), "—");
});

test("hopTransitText hides unknown, zero and nonsense transit", () => {
  for (const h of [null, undefined, 0, -1, NaN, Infinity]) assert.equal(q.hopTransitText(h, false), null);
  assert.equal(q.hopTransitText(4, false), "~4 h");
  assert.equal(q.hopTransitText(24, true), "~24 h");
  assert.equal(q.hopTransitText(60, true), "~2 j 12 h");
});

test("the one customer fee line: its label, and the number it shows", () => {
  assert.equal(q.platformFeeLabel(false), "Platform commission");
  assert.equal(q.platformFeeLabel(true), "Commission de la plateforme");
  // the server's platformFeeUsd wins; an older server's total fee is the fallback; an order carries deliveryFee(Usd)
  assert.equal(q.platformFee({ platformFeeUsd: 4.5, feeUsd: 4 }), 4.5);
  assert.equal(q.platformFee({ platformFeeUsd: 0, feeUsd: 4 }), 0);
  assert.equal(q.platformFee({ feeUsd: 4 }), 4);
  assert.equal(q.platformFee({ deliveryFeeUsd: 3 }), 3);
  assert.equal(q.platformFee({ deliveryFee: 2 }), 2);
  assert.equal(q.platformFee({ platformFeeUsd: null, feeUsd: undefined }), 0);
  assert.equal(q.platformFee(null), 0);
});

test("an express order keeps its badge but no longer prices the delivery apart; the product fee check names where it comes from", () => {
  assert.equal(q.deliveryLineLabel, undefined);
  assert.equal(q.feeOriginText({ deliveryMode: "express", destinationHubName: "Entrepôt Kinshasa" }, false), "Express · straight from the store");
  assert.equal(q.feeOriginText({ deliveryMode: "express" }, true), "Express · directement depuis la boutique");
  assert.equal(q.feeOriginText({ destinationHubName: "Entrepôt Kinshasa" }, false), "from Entrepôt Kinshasa");
  assert.equal(q.feeOriginText({ destinationHub: { name: "Hub B" } }, true), "depuis Hub B");
  assert.equal(q.feeOriginText(null, false), "");
});
