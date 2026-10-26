// Run: npm test (from web/). Transpiles seller-errors.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./seller-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { frenchServerMessage, englishServerMessage } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("area contract errors map to French in the seller portal", () => {
  assert.equal(frenchServerMessage("This area is already covered by Entrepôt Limete."), "Cette zone est déjà couverte par Entrepôt Limete.");
  assert.equal(frenchServerMessage("Choose where this warehouse is."), "Choisissez où se trouve cet entrepôt.");
  assert.equal(frenchServerMessage("Area not found."), "Zone introuvable.");
  assert.equal(frenchServerMessage("We don't deliver to Lubumbashi yet."), "Nous ne livrons pas encore à Lubumbashi.");
  assert.match(
    frenchServerMessage("Your pickup area is not served yet. You can prepare your store; sales open when we deliver there."),
    /^Votre zone de collecte n'est pas encore desservie/,
  );
  assert.equal(englishServerMessage("Area not found."), "Area not found.");
});

test("lane and transfer-run errors map to French in the seller portal", () => {
  assert.equal(frenchServerMessage("This run has already left."), "Cette navette est déjà partie.");
  assert.equal(frenchServerMessage("Parcel missing from run TR-0042."), "Colis manquant dans la navette TR-0042.");
  assert.equal(frenchServerMessage("These warehouses are not connected by any lane."), "Ces entrepôts ne sont reliés par aucune liaison.");
});

test("geography, lane and run validation errors map to French in the seller portal", () => {
  assert.equal(frenchServerMessage("Run not found."), "Navette introuvable.");
  assert.equal(frenchServerMessage("Name must be 2-150 characters."), "Le nom : 2 à 150 caractères.");
  assert.equal(frenchServerMessage("Transit time (hours) must be a number between 0 and 720."), "Le temps de transit (heures) : un nombre entre 0 et 720.");
});

test("routing, checkout and desk errors of the final areas contract map to French in the seller portal", () => {
  assert.equal(frenchServerMessage("Delivery between cities is not available right now."), "La livraison entre villes n'est pas disponible pour le moment.");
  assert.equal(frenchServerMessage("One seller in your cart cannot ship from their area yet."), "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.");
  assert.equal(frenchServerMessage("This parcel is part of a transfer run. Manage it from the run."), "Ce colis fait partie d'une navette de transfert. Gérez-le depuis la navette.");
  assert.equal(frenchServerMessage("Choose a warehouse."), "Choisissez un entrepôt.");
  assert.equal(frenchServerMessage("Riders only."), "Réservé aux livreurs.");
  assert.equal(frenchServerMessage("We don't deliver to this area yet."), "Nous ne livrons pas encore dans cette zone.");
  assert.equal(frenchServerMessage("We don’t deliver to this area yet."), "Nous ne livrons pas encore dans cette zone.");
  assert.equal(frenchServerMessage("We don't deliver to Goma yet."), "Nous ne livrons pas encore à Goma.");
});

test("every error sentence listed in docs/contracts/areas.md has a French text in the seller portal (drift guard)", () => {
  let doc;
  try {
    doc = readFileSync(new URL("../../../docs/contracts/areas.md", import.meta.url), "utf8");
  } catch {
    return;
  }
  const section = doc.slice(doc.indexOf("## Errors (English on the wire"));
  const sentences = [...section.matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((s) => s.endsWith(".") && s.includes(" ") && /[A-Za-z]{3}/.test(s));
  const fill = (s) => s.replace("{area}", "Lubumbashi").replace("{hub}", "Entrepôt Limete").replace("{ref}", "TR-0042").replaceAll("{level}", "province");
  const missing = sentences.map(fill).filter((s) => frenchServerMessage(s) === s);
  assert.deepEqual(missing, []);
});
