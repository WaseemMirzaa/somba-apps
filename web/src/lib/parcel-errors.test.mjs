// Run: npm test (from web/). Transpiles parcel-errors.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./parcel-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const fr = (s) => m.localizeParcelError(s, true);

test("every parcel-scan refusal has French, with its code and numbers kept", () => {
  assert.equal(fr("PKG-7KQ2M9XA is not part of this pickup."), "PKG-7KQ2M9XA ne fait pas partie de cette collecte.");
  assert.equal(fr("PKG-7KQ2M9XA is not part of this delivery."), "PKG-7KQ2M9XA ne fait pas partie de cette livraison.");
  assert.equal(fr("PKG-7KQ2M9XA is not part of this transfer."), "PKG-7KQ2M9XA ne fait pas partie de ce transfert.");
  assert.equal(fr("PKG-7KQ2M9XA is not part of this express delivery."), "PKG-7KQ2M9XA ne fait pas partie de cette livraison express.");
  assert.equal(fr("PKG-7KQ2M9XA is not part of this return pickup."), "PKG-7KQ2M9XA ne fait pas partie de cette collecte de retour.");
  assert.equal(fr("PKG-7KQ2M9XA is not part of this something new."), "PKG-7KQ2M9XA ne fait pas partie de ce trajet.");
  assert.equal(fr("PKG-7KQ2M9XA was already scanned."), "PKG-7KQ2M9XA a déjà été scanné.");
  assert.equal(fr("PKG-7KQ2M9XA was cancelled; use the new label."), "PKG-7KQ2M9XA a été annulé ; utilisez la nouvelle étiquette.");
  assert.equal(fr("That is not a KOMORIKO parcel code. Codes look like PKG-7KQ2M9XA."), "Ce n'est pas un code colis KOMORIKO. Les codes ressemblent à PKG-7KQ2M9XA.");
  assert.equal(fr("Collect PKG-7KQ2M9XA first: this leg is not picked up yet."), "Collectez d'abord PKG-7KQ2M9XA : ce trajet n'est pas encore collecté.");
  assert.equal(fr("This leg is already closed."), "Ce trajet est déjà clos.");
  assert.equal(fr("Scan every parcel first: 2 of 3 scanned."), "Scannez tous les colis d'abord : 2 sur 3 scannés.");
  assert.match(fr("PKG-7KQ2M9XA is not due at your warehouse."), /pas attendu/);
  assert.match(fr("PKG-7KQ2M9XA is not waiting to leave your warehouse."), /quitter votre entrepôt/);
  assert.match(fr("A rider must collect PKG-7KQ2M9XA before it can be scanned in."), /livreur doit/);
  assert.match(fr("Assign a rider before handing PKG-7KQ2M9XA over."), /Assignez un livreur/);
  assert.match(fr("Only a supervisor or a manager can mark a parcel by hand."), /superviseur ou un responsable/);
});

test("English readers get the sentence untouched, unknown or already-French messages pass through", () => {
  assert.equal(m.localizeParcelError("PKG-7KQ2M9XA was already scanned.", false), "PKG-7KQ2M9XA was already scanned.");
  assert.equal(fr("Something else broke."), "Something else broke.");
  assert.equal(fr("Ce trajet est déjà clos."), "Ce trajet est déjà clos.");
  assert.equal(fr(""), "");
});

test("the scan-first refusal is recognised in both languages and gets the desk hint", () => {
  assert.deepEqual(m.parseScanFirst("Scan every parcel first: 0 of 2 scanned."), { scanned: 0, total: 2 });
  assert.deepEqual(m.parseScanFirst("Scannez tous les colis d'abord : 1 sur 4 scannés."), { scanned: 1, total: 4 });
  assert.equal(m.parseScanFirst("This leg is already closed."), null);
  assert.match(m.parcelErrorWithHint("Scan every parcel first: 0 of 2 scanned.", false), /^Scan every parcel first: 0 of 2 scanned\. Scan each box's code/);
  assert.match(m.parcelErrorWithHint("Scan every parcel first: 0 of 2 scanned.", true), /^Scannez tous les colis d'abord : 0 sur 2 scannés\. Scannez le code/);
  assert.equal(m.parcelErrorWithHint("This leg is already closed.", false), "This leg is already closed.");
});
