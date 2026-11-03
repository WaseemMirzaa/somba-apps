// Run: npm test (from web/). The stock ledger's server sentences read in French (docs/contracts/warehouse-stock.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./api-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { localizeApiError } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
const fr = (m) => localizeApiError(m, "fr");

test("exact sentences", () => {
  assert.equal(fr("Choose a warehouse first."), "Choisissez d'abord un entrepôt.");
  assert.equal(fr("Scan the parcel in before putting it away."), "Enregistrez le colis à l'arrivée avant de le ranger.");
  assert.equal(fr("The receiving area cannot be switched off."), "La zone de réception ne peut pas être désactivée.");
  assert.equal(fr("Everything on this parcel is already in stock."), "Tout le contenu de ce colis est déjà en stock.");
  assert.equal(fr("Product not found."), "Produit introuvable.");
  assert.equal(localizeApiError("Choose a warehouse first.", "en"), "Choose a warehouse first.");
});

test("negative stock refusals carry their numbers and names", () => {
  assert.equal(fr("Bin A-01 holds only 5 of Phone case: you cannot take 6."), "L'emplacement A-01 ne contient que 5 × Phone case : vous ne pouvez pas en prendre 6.");
  assert.equal(fr("Bin B-02 holds no Phone case."), "L'emplacement B-02 ne contient aucun Phone case.");
  assert.equal(fr("Bin A-01 holds only 2 of T-shirt (Size: M): you cannot take 3."), "L'emplacement A-01 ne contient que 2 × T-shirt (Size: M) : vous ne pouvez pas en prendre 3.");
});

test("bins, parcels and counts", () => {
  assert.match(fr("Bin A-01 already exists in this warehouse."), /existe déjà/);
  assert.match(fr("Bin A-01 still holds stock. Move it or count it out first."), /contient encore du stock/);
  assert.match(fr("Bin A-01 is switched off. Choose another bin."), /désactivé/);
  assert.match(fr("This parcel carries 2 more of Phone case: you cannot put away 3."), /encore 2 × Phone case.*ranger 3/);
  assert.match(fr("Phone case from this parcel is already in stock."), /déjà en stock/);
  assert.match(fr("Phone case in bin A-01 changed while you were counting (now 9). Refresh and count again."), /a changé pendant le comptage \(maintenant 9\)/);
  assert.match(fr("Phone case in bin A-01 was just updated. Refresh and count again."), /vient d'être mis à jour/);
  assert.match(fr("Enter the counted number of Phone case (0 or more)."), /quantité comptée de Phone case/);
  assert.match(fr("Phone case is on the sheet twice."), /deux fois/);
  assert.match(fr("Reason must be one of: damaged, lost."), /motif/);
});
