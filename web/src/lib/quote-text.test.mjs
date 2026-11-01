// Run: npm test (from web/). Transpiles quote-text.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./quote-text.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const q = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const hop = (from, to, transitHours, costUsd) => ({ fromHubId: from, fromHubName: `Entrepôt ${from}`, toHubId: to, toHubName: `Entrepôt ${to}`, transitHours, costUsd });

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

test("per-hop transit and cost come from origins[].hops[]", () => {
  const quote = {
    transferUsd: 3.5,
    origins: [{ sellerId: "s1", areaName: "Limete", areaNameEn: "Limete", hops: [hop("L", "K", 4, 2), hop("K", "W", 24, null)], transitHours: 28 }],
  };
  const [route] = q.quoteRoutes(quote, false);
  assert.equal(route.hops.length, 2);
  assert.deepEqual([route.hops[0].from, route.hops[0].to, route.hops[0].transitHours, route.hops[0].costUsd, route.hops[0].standardFee], ["Entrepôt L", "Entrepôt K", 4, 2, false]);
  // The second lane has no cost of its own: the standard fee is what is left of the total (3.50 - 2.00).
  assert.deepEqual([route.hops[1].transitHours, route.hops[1].costUsd, route.hops[1].standardFee], [24, 1.5, true]);
  assert.equal(route.transitHours, 28);
});

test("a hop shared by two sellers pays once: the standard fee is not split twice", () => {
  const quote = {
    transferUsd: 3,
    origins: [
      { sellerId: "a", hops: [hop("L", "K", 4, null)] },
      { sellerId: "b", hops: [hop("L", "K", 4, null), hop("K", "W", 24, null)] },
    ],
  };
  assert.equal(q.standardHopFee(quote), 1.5);
  const routes = q.quoteRoutes(quote, true);
  assert.equal(routes.length, 2);
  assert.equal(routes[1].hops[1].costUsd, 1.5);
  // Two routes: each one is labelled by its seller's area (the French name in French).
  const labelled = q.quoteRoutes({ transferUsd: 1.5, origins: [{ areaName: "Limète", areaNameEn: "Limete", hops: [hop("L", "K", 4, null)] }, { areaName: "Gombe", hops: [hop("G", "K", 2, null)] }] }, false);
  assert.deepEqual(labelled.map((r) => r.label), ["Limete", "Gombe"]);
});

test("old payloads: no transit and no cost per hop, or one chain on the quote", () => {
  const oldOrigins = q.quoteRoutes({ origins: [{ hops: [{ fromHubId: "L", fromHubName: "Entrepôt L", toHubId: "K", toHubName: "Entrepôt K" }] }] }, false);
  assert.equal(oldOrigins[0].hops[0].transitHours, null);
  assert.equal(oldOrigins[0].hops[0].costUsd, null);
  assert.equal(oldOrigins[0].transitHours, null);
  const flat = q.quoteRoutes({ hops: [hop("L", "K", 4, 2)] }, false);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].hops[0].costUsd, 2);
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

test("a hop with no known transit time (a direct transfer, no lane) shows its cost only: no \"~0 min\"", () => {
  const money = (usd) => `$${usd.toFixed(2)}`;
  // the case from the demo: no lane configured, the default transfer fee, transit 0
  assert.equal(q.hopFigures({ transitHours: 0, costUsd: 1.5 }, false, money), "$1.50");
  assert.equal(q.hopFigures({ transitHours: 0, costUsd: 1.5 }, true, money), "$1.50");
  assert.equal(q.hopFigures({ transitHours: null, costUsd: 1.5 }, false, money), "$1.50");
  assert.equal(q.hopFigures({ costUsd: 1.5 }, false, money), "$1.50");
  // a lane with a transit time shows both
  assert.equal(q.hopFigures({ transitHours: 4, costUsd: 2 }, false, money), "~4 h · $2.00");
  assert.equal(q.hopFigures({ transitHours: 36, costUsd: 2 }, true, money), "~36 h · $2.00");
  assert.equal(q.hopFigures({ transitHours: 72, costUsd: 0 }, true, money), "~3 j · Gratuit");
  assert.equal(q.hopFigures({ transitHours: 0.5, costUsd: null }, false, money), "~30 min");
  // a free hop with no transit is still said
  assert.equal(q.hopFigures({ transitHours: 0, costUsd: 0 }, false, money), "Free");
  // nothing to say
  assert.equal(q.hopFigures({ transitHours: 0, costUsd: null }, false, money), "");
  assert.equal(q.hopFigures({}, false, money), "");
});

test("hopTransitText hides unknown, zero and nonsense transit", () => {
  for (const h of [null, undefined, 0, -1, NaN, Infinity]) assert.equal(q.hopTransitText(h, false), null);
  assert.equal(q.hopTransitText(4, false), "~4 h");
  assert.equal(q.hopTransitText(24, true), "~24 h");
  assert.equal(q.hopTransitText(60, true), "~2 j 12 h");
});
