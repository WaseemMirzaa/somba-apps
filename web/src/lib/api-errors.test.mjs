// Run: npm test (from web/). Transpiles api-errors.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./api-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { localizeApiError } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("exact contract sentences map to French; English is untouched", () => {
  const m = "Pin your delivery address on the map.";
  assert.equal(localizeApiError(m, "en"), m);
  assert.equal(localizeApiError(m, "fr"), "Placez votre adresse de livraison sur la carte.");
  assert.equal(localizeApiError("This parcel was already scanned in.", "fr"), "Ce colis a déjà été scanné.");
});

test("sentences with numbers and names map to French", () => {
  assert.match(localizeApiError('You can return at most 2 of "Shoe".', "fr"), /2 × « Shoe »/);
  assert.match(localizeApiError("Returns are accepted within 7 days of delivery, and that time has passed.", "fr"), /7 jours/);
  assert.match(localizeApiError('Only 3 of "Shoe" (Size: 42) left in stock.', "fr"), /Il ne reste que 3/);
});

test("a bilingual sentence keeps the French half; unknown sentences pass through", () => {
  const v = "Acme is on vacation until 12 Nov 2026 and is not taking new orders. / Acme est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.";
  assert.match(localizeApiError(v, "fr"), /^Acme est en vacances/);
  assert.equal(localizeApiError("Something odd", "fr"), "Something odd");
});

test("area contract errors map to French (docs/contracts/areas.md)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("This area is already covered by Entrepôt Limete."), "Cette zone est déjà couverte par Entrepôt Limete.");
  assert.equal(fr("Choose where this warehouse is."), "Choisissez où se trouve cet entrepôt.");
  assert.equal(fr("Area not found."), "Zone introuvable.");
  assert.match(fr("A warehouse cannot cover an area it is not allowed to serve."), /^Un entrepôt ne peut pas couvrir/);
  assert.match(fr("Your pickup area is not served yet. You can prepare your store; sales open when we deliver there."), /^Votre zone de collecte n'est pas encore desservie/);
  assert.equal(fr("We don't deliver to Lubumbashi yet."), "Nous ne livrons pas encore à Lubumbashi.");
  assert.equal(fr("We don’t deliver to Masina yet."), "Nous ne livrons pas encore à Masina.");
  // English readers get the sentence untouched.
  assert.equal(localizeApiError("We don't deliver to Lubumbashi yet.", "en"), "We don't deliver to Lubumbashi yet.");
});

test("lane and transfer-run errors map to French", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("This run has already left."), "Cette tournée est déjà partie.");
  assert.equal(fr("Choose a driver for this run first."), "Choisissez d'abord un chauffeur pour cette tournée.");
  assert.equal(fr("Only parcels waiting at this warehouse can join this run."), "Seuls les colis qui attendent dans cet entrepôt peuvent rejoindre cette tournée.");
  assert.equal(fr("Parcel missing from run TR-0042."), "Colis manquant dans la tournée TR-0042.");
  assert.equal(fr("These warehouses are not connected by any lane."), "Ces entrepôts ne sont reliés par aucune liaison.");
});

test("geography, lane and run validation errors map to French", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Run not found."), "Tournée introuvable.");
  assert.equal(fr("Lane not found."), "Liaison introuvable.");
  assert.equal(fr("A lane connects two different warehouses."), "Une liaison relie deux entrepôts différents.");
  assert.equal(fr("Choose some of the parcels of this run, not all of them."), "Choisissez une partie des colis de cette tournée, pas tous.");
  assert.equal(fr("Name must be 2-150 characters."), "Le nom : 2 à 150 caractères.");
  assert.equal(fr("Transit time (hours) must be a number between 0 and 720."), "Le temps de transit (heures) : un nombre entre 0 et 720.");
  assert.equal(fr("A quartier cannot be added under a province."), "Impossible d'ajouter un quartier sous une province.");
  assert.equal(fr("An area with this name already exists here."), "Une zone portant ce nom existe déjà à cet endroit.");
});

test("routing and checkout errors of the final areas contract map to French", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Delivery between cities is not available right now."), "La livraison entre villes n'est pas disponible pour le moment.");
  assert.equal(fr("One seller in your cart cannot ship from their area yet."), "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.");
  assert.equal(fr("This parcel is part of a transfer run. Manage it from the run."), "Ce colis fait partie d'une tournée de transfert. Gérez-le depuis la tournée.");
  assert.equal(fr("Address not found."), "Adresse introuvable.");
  // `{area}` is "this area" when the server matched nothing at all.
  assert.equal(fr("We don't deliver to this area yet."), "Nous ne livrons pas encore dans cette zone.");
  assert.equal(fr("We don’t deliver to this area yet."), "Nous ne livrons pas encore dans cette zone.");
  assert.equal(localizeApiError("Delivery between cities is not available right now.", "en"), "Delivery between cities is not available right now.");
});

test("every error sentence listed in docs/contracts/areas.md has a French text (drift guard)", () => {
  let doc;
  try {
    doc = readFileSync(new URL("../../../docs/contracts/areas.md", import.meta.url), "utf8");
  } catch {
    return; // the contract is not shipped with this checkout
  }
  const section = doc.slice(doc.indexOf("## Errors (English on the wire"));
  const sentences = [...section.matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((s) => s.endsWith(".") && s.includes(" ") && /[A-Za-z]{3}/.test(s));
  assert.ok(sentences.length > 30, "the Errors section was not found");
  const fill = (s) => s.replace("{area}", "Lubumbashi").replace("{hub}", "Entrepôt Limete").replace("{ref}", "TR-0042").replaceAll("{level}", "province");
  const missing = sentences.map(fill).filter((s) => localizeApiError(s, "fr") === s);
  assert.deepEqual(missing, []);
});

test("staff:setActive errors map to French", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Only riders and warehouse staff can be switched on or off here."), "Seuls les livreurs et le personnel d'entrepôt peuvent être activés ou désactivés ici.");
  assert.equal(fr("Super admin only."), "Réservé au super administrateur.");
  assert.equal(fr("Account not found."), "Compte introuvable.");
  assert.equal(fr("Active must be true or false."), "« Active » doit être vrai ou faux.");
  assert.equal(localizeApiError("Super admin only.", "en"), "Super admin only.");
});
