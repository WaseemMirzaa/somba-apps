// Run: npm test (from web/). Transpiles i18n-fields.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./i18n-fields.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const {
  pickText, localized, localizedNotice, foldText, matchesSearch, labeledGroups, localizeVariantText,
  isMachineText, fieldOrigin, ownText, frInForm,
  noticeTypeLabel, variantDisplay, localizeVariant, daysLabel, categoryLabel, productNameFor, resolutionText,
} = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("pickText falls back to the other language when one is empty", () => {
  assert.equal(pickText(true, "Phone", "Téléphone"), "Téléphone");
  assert.equal(pickText(true, "Phone", null), "Phone");
  assert.equal(pickText(true, "Phone", "  "), "Phone");
  assert.equal(pickText(false, "", "Téléphone"), "Téléphone");
  assert.equal(pickText(false, "Phone", "Téléphone"), "Phone");
});

test("localized reads <key> / <key>Fr", () => {
  const line = { productName: "Black shoes", productNameFr: "Chaussures noires", variant: "Colour: Black" };
  assert.equal(localized(line, "productName", true), "Chaussures noires");
  assert.equal(localized(line, "productName", false), "Black shoes");
  assert.equal(localized(line, "variant", true), "Colour: Black"); // no variantFr: falls back
  assert.equal(localized(null, "x", true), "");
});

test("localizedNotice uses titleFr / bodyFr and falls back to English", () => {
  const n = { title: "New order", body: "ORD-1", titleFr: "Nouvelle commande" };
  assert.deepEqual(localizedNotice(n, true), { title: "Nouvelle commande", body: "ORD-1" });
  assert.deepEqual(localizedNotice(n, false), { title: "New order", body: "ORD-1" });
});

test("search folds accents, case and ligatures", () => {
  assert.equal(foldText("Électronique"), "electronique");
  assert.equal(foldText("  Cœur "), "coeur");
  assert.ok(matchesSearch("electronique", ["Électronique"]));
  assert.ok(matchesSearch("ecouteurs sans fil", ["Écouteurs", "sans fil Bluetooth"]));
  assert.ok(!matchesSearch("montre", ["Électronique"]));
  assert.ok(matchesSearch("   ", ["anything"]));
});

const groups = [{ name: "Size", options: ["S", "M"] }, { name: "Colour", options: ["Black", "White"] }];
const labels = {
  en: groups,
  fr: [{ name: "Taille", options: ["S", "M"] }, { name: "Couleur", options: ["Noir", "Blanc"] }],
};

test("labeledGroups shows the viewer's labels but keeps canonical keys", () => {
  const fr = labeledGroups(groups, labels, true);
  assert.equal(fr[1].label, "Couleur");
  assert.deepEqual(fr[1].options, [{ value: "Black", label: "Noir" }, { value: "White", label: "Blanc" }]);
  assert.equal(fr[1].name, "Colour");
});

test("labels that do not fit the groups are ignored (C-I4)", () => {
  const bad = { en: groups, fr: [{ name: "Taille", options: ["S"] }, { name: "Couleur", options: ["Noir", "Blanc"] }] };
  assert.equal(labeledGroups(groups, bad, true)[0].label, "Size");
  assert.equal(labeledGroups(groups, null, true)[1].options[0].label, "Black");
});

test("localizeVariantText translates the canonical variant label", () => {
  assert.equal(localizeVariantText("Size: M · Colour: Black", groups, labels, true), "Taille: M · Couleur: Noir");
  assert.equal(localizeVariantText("Size: M · Colour: Black", groups, labels, false), "Size: M · Colour: Black");
  assert.equal(localizeVariantText("Default", groups, labels, true), "Default");
  assert.equal(localizeVariantText("Size: XL · Colour: Black", groups, labels, true), "Size: XL · Colour: Black");
  assert.equal(localizeVariantText("Size: M", [], labels, true), "Size: M");
});

test("fieldOrigin tells author text from machine text, pending and failed", () => {
  const p = { sourceLang: "en", machineTranslated: ["nameFr"], translationStatus: "done" };
  assert.ok(isMachineText(p, "name", "fr"));
  assert.ok(!isMachineText(p, "name", "en"));
  assert.equal(fieldOrigin(p, "name", "en", "Phone", "Phone"), "author");
  assert.equal(fieldOrigin(p, "name", "fr", "Téléphone", "Phone"), "machine");
  assert.equal(fieldOrigin({ ...p, translationStatus: "pending" }, "name", "fr", "", "Phone"), "pending");
  assert.equal(fieldOrigin({ ...p, translationStatus: "failed" }, "name", "fr", "", "Phone"), "failed");
  assert.equal(fieldOrigin({ ...p, translationStatus: "pending" }, "description", "fr", "", ""), "empty");
});

test("ownText hides the fallback copy of the source text", () => {
  const frFirst = { sourceLang: "fr", name: "Chaussures", nameFr: "Chaussures", translationStatus: "pending", machineTranslated: [] };
  assert.equal(ownText(frFirst, "name", "fr"), "Chaussures");
  assert.equal(ownText(frFirst, "name", "en"), "");
  const done = { ...frFirst, name: "Shoes", machineTranslated: ["name"], translationStatus: "done" };
  assert.equal(ownText(done, "name", "en"), "Shoes");
  // identical in both languages once translation finished (e.g. a brand name): it is real text
  assert.equal(ownText({ ...frFirst, name: "Nike", nameFr: "Nike", translationStatus: "done" }, "name", "en"), "Nike");
});

test("frInForm blanks the English copy the API serves until a translation exists", () => {
  assert.equal(frInForm("Electronics", "Electronics"), "");
  assert.equal(frInForm("Electronics", "Électronique"), "Électronique");
  assert.equal(frInForm("Electronics", null), "");
});

test("noticeTypeLabel names a notification type in the viewer's language", () => {
  assert.equal(noticeTypeLabel("order", true), "Commande");
  assert.equal(noticeTypeLabel("order", false), "Order");
  assert.equal(noticeTypeLabel("task", true), "Tâche de livraison");
  assert.equal(noticeTypeLabel("some_new_type", true), "some new type");
});

test("variantDisplay ignores the API's copy of 'Default' and falls back to the known tokens", () => {
  assert.equal(variantDisplay("Default", "Default", true), "Par défaut");
  assert.equal(variantDisplay("Default", null, false), "Default");
  assert.equal(variantDisplay("Size: M · Colour: Black", "Taille : M · Couleur : Noir", true), "Taille : M · Couleur : Noir");
  assert.equal(localizeVariant("256GB Black", true), "256 Go Noir");
});

test("daysLabel agrees with the count", () => {
  assert.equal(daysLabel(1, false), "1 day");
  assert.equal(daysLabel(3, false), "3 days");
  assert.equal(daysLabel(1, true), "1 jour");
  assert.equal(daysLabel(3, true), "3 jours");
});

test("categoryLabel / productNameFor read the other language from the list by English name / id", () => {
  const cats = [{ name: "Electronics", nameFr: "Électronique" }, { name: "Toys", nameFr: null }];
  assert.equal(categoryLabel(cats, "Electronics", true), "Électronique");
  assert.equal(categoryLabel(cats, "Electronics", false), "Electronics");
  assert.equal(categoryLabel(cats, "Toys", true), "Toys");
  assert.equal(categoryLabel(cats, "Unknown", true), "Unknown");
  const prods = [{ id: "p1", name: "Dyson V15 Vacuum", nameFr: "Aspirateur Dyson V15" }];
  assert.equal(productNameFor(prods, "p1", "x", true), "Aspirateur Dyson V15");
  assert.equal(productNameFor(prods, "p2", "Fallback", true), "Fallback");
});

test("resolutionText: the API's French first, known stock phrases mapped, an agent's own words untouched", () => {
  assert.equal(resolutionText({ resolution: "Refunded to wallet", resolutionFr: "Remboursé sur le portefeuille" }, true), "Remboursé sur le portefeuille");
  assert.equal(resolutionText({ resolution: "Refunded to wallet" }, true), "Remboursé sur le portefeuille");
  assert.equal(resolutionText({ resolution: "Partially refunded" }, true), "Remboursement partiel");
  assert.equal(resolutionText({ resolution: "Refunded to wallet", resolutionFr: "Remboursé sur le portefeuille" }, false), "Refunded to wallet");
  assert.equal(resolutionText({ resolution: "Item was damaged, refunded in full" }, true), "Item was damaged, refunded in full");
  assert.equal(resolutionText({ resolution: null }, true), "");
  assert.equal(resolutionText(null, false), "");
});
