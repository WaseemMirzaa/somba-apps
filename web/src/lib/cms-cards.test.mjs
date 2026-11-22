// Run: npm test (from web/). Transpiles cms-cards.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./cms-cards.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const draft = (over = {}) => ({
  key: "k", title: "t", titleFr: "", body: "b", bodyFr: "", type: "banner", active: true,
  imageUrl: "", linkType: "", linkTarget: "", ctaText: "", ctaTextFr: "", colorKey: "", startsAt: "", endsAt: "", ...over,
});

test("an empty card sends nulls so a cleared field is cleared on the server", () => {
  assert.deepEqual(m.cardPayload(draft()), { imageUrl: null, linkType: null, linkTarget: null, ctaText: null, ctaTextFr: null, colorKey: null, startsAt: null, endsAt: null });
});

test("a full card sends its link, button, colour and schedule; deals drops the target", () => {
  const p = m.cardPayload(draft({ imageUrl: " https://x/y.jpg ", linkType: "product", linkTarget: " p1 ", ctaText: "Shop", ctaTextFr: "Acheter", colorKey: "blue", startsAt: "2026-03-01T08:00" }));
  assert.equal(p.imageUrl, "https://x/y.jpg");
  assert.equal(p.linkTarget, "p1");
  assert.equal(p.colorKey, "blue");
  assert.match(p.startsAt, /^2026-03-01T/);
  assert.equal(m.cardPayload(draft({ linkType: "deals", linkTarget: "ignored" })).linkTarget, null);
});

test("the form is checked in both languages before it is sent", () => {
  assert.equal(m.cardError(draft(), false), null);
  assert.match(m.cardError(draft({ key: " " }), false), /unique key/);
  assert.match(m.cardError(draft({ linkType: "store" }), true), /Choisissez le produit/);
  assert.match(m.cardError(draft({ linkType: "url", linkTarget: "http://a.b" }), false), /https:\/\//);
  assert.equal(m.cardError(draft({ linkType: "deals", ctaText: "Go" }), false), null);
  assert.match(m.cardError(draft({ ctaText: "Go" }), false), /somewhere to go/);
  assert.match(m.cardError(draft({ startsAt: "2026-05-02T10:00", endsAt: "2026-05-01T10:00" }), false), /end date/);
  assert.match(m.cardError(draft({ ctaText: "x".repeat(41), linkType: "deals" }), false), /1 to 40/);
});

test("the local date input round-trips", () => {
  const iso = "2026-06-15T09:30:00.000Z";
  assert.equal(m.fromLocalInput(m.toLocalInput(iso)), iso);
  assert.equal(m.toLocalInput(null), "");
  assert.equal(m.fromLocalInput("  "), null);
});

test("moving a card up or down swaps it with its neighbour and stops at the ends", () => {
  assert.deepEqual(m.movedKeys(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(m.movedKeys(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  assert.deepEqual(m.movedKeys(["a", "b"], 0, -1), ["a", "b"]);
  assert.deepEqual(m.movedKeys(["a", "b"], 1, 1), ["a", "b"]);
});

test("a row's state: hidden, scheduled, ended or live", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  assert.equal(m.cardState({ active: false }, now), "hidden");
  assert.equal(m.cardState({ active: true, startsAt: "2026-07-01T00:00:00Z" }, now), "scheduled");
  assert.equal(m.cardState({ active: true, endsAt: "2026-06-01T00:00:00Z" }, now), "ended");
  assert.equal(m.cardState({ active: true, startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-07-01T00:00:00Z" }, now), "live");
});

test("an unknown colour or link type from the server falls back safely", () => {
  assert.equal(m.cardFields({ key: "k", title: "", body: "", type: "banner", active: true, colorKey: "pink", linkType: "weird" }).colorKey, "");
  assert.equal(m.cardFields({ key: "k", title: "", body: "", type: "banner", active: true, linkType: "weird" }).linkType, "");
  assert.match(m.gradientFor("nope"), /FF1F3A/);
});
