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

test("the refund cap's sentences are French on every refund path (C-refund)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Nothing is left to refund on this order."), "Il ne reste rien à rembourser sur cette commande.");
  assert.equal(fr("Already refunded."), "Déjà remboursé.");
  assert.equal(fr("That is more than what is left to refund on this order ($23.00)."), "C'est plus que ce qu'il reste à rembourser sur cette commande ($23.00).");
  assert.equal(fr("Only a completed payment can be refunded."), "Seul un paiement abouti peut être remboursé.");
  assert.match(fr("pawaPay refused the refund: Deposit not completed"), /^pawaPay a refusé le remboursement : Deposit not completed$/);
  assert.equal(localizeApiError("Nothing is left to refund on this order.", "en"), "Nothing is left to refund on this order.");
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

test("the permission refusals of the tiers and departments are French (least privilege)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Only supervisors and managers can see this."), "Seuls les superviseurs et les responsables peuvent voir ceci.");
  assert.equal(fr("Only supervisors and managers can do this."), "Seuls les superviseurs et les responsables peuvent effectuer cette action.");
  assert.equal(fr("Only managers can see this."), "Seuls les responsables peuvent voir ceci.");
  assert.equal(fr("Only a moderator can change this listing's status."), "Seul un modérateur peut modifier le statut de cette annonce.");
  assert.equal(fr("Only marketing can decide on campaigns."), "Seule l'équipe marketing peut décider des campagnes.");
  assert.equal(fr("Only sellers or marketing can create campaigns."), "Seuls les vendeurs ou l'équipe marketing peuvent créer des campagnes.");
  assert.equal(localizeApiError("Only managers can see this.", "en"), "Only managers can see this.");
});

test("the cash-on-delivery sentences are French (C-cod)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.match(fr("Only supervisors and managers can record a rider's cash hand-over."), /superviseurs et les responsables/);
  assert.equal(fr("Rider One holds $40.00: you cannot record $40.01."), "Rider One détient 40.00 $ : vous ne pouvez pas enregistrer 40.01 $.");
  assert.equal(fr("Rider One holds no cash to hand in."), "Rider One ne détient aucune espèce à remettre.");
  assert.match(fr("The cash you entered ($35.00) is not the amount to collect ($40.00). Collect exactly $40.00, or ask the warehouse if the amount changed."), /ne correspondent pas au montant à encaisser \(40\.00 \$\)/);
  assert.match(fr("Confirm the cash you collected: $40.00 is due on this delivery."), /Confirmez les espèces/);
  assert.match(fr("This delivery is already complete with $40.00 collected."), /déjà terminée/);
  const m = "The cash you entered ($35.00) is not the amount to collect ($40.00). Collect exactly $40.00, or ask the warehouse if the amount changed.";
  assert.equal(localizeApiError(m, "en"), m);
});

test("rider vehicle and document errors map to French (docs/contracts/rider-compliance.md)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Give a reason of 3-300 characters."), "Indiquez un motif de 3 à 300 caractères.");
  assert.equal(fr("Rider not found."), "Livreur introuvable.");
  assert.equal(fr("Only JPEG, PNG or PDF files are accepted."), "Seuls les fichiers JPEG, PNG ou PDF sont acceptés.");
  assert.equal(fr("Odometer must be a whole number between 0 and 5000000."), "Le compteur : un nombre entre 0 et 5000000.");
  assert.equal(fr("Plate must be 1-20 characters."), "La plaque : 1 à 20 caractères.");
  assert.equal(fr("Next service must be a date written YYYY-MM-DD."), "Le prochain entretien : une date au format AAAA-MM-JJ.");
  assert.equal(fr("Fuel must be one of: petrol, diesel, electric, hybrid, none."), "Le carburant n'est pas valide.");
  assert.equal(localizeApiError("Give a reason of 3-300 characters.", "en"), "Give a reason of 3-300 characters.");
});

test("a refused account deletion is French sentence by sentence; an unknown reason stays English", () => {
  const raw =
    "You cannot delete your account yet. Your wallet still holds $204.00: spend it or ask support to pay it out first. You have 2 orders that are not finished yet: wait until they are delivered, or cancel them, first.";
  const fr = localizeApiError(raw, "fr");
  assert.match(fr, /^Vous ne pouvez pas encore supprimer votre compte\. Votre portefeuille contient encore 204,00 \$/);
  assert.match(fr, /Vous avez 2 commandes qui ne sont pas terminées/);
  assert.equal(localizeApiError(raw, "en"), raw);
  assert.equal(localizeApiError(`${raw} Something new is pending.`, "fr"), `${raw} Something new is pending.`);
});

test("the warehouse desk and order-reading refusals are French (least privilege)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("Only operations admins and warehouse staff can work the warehouse desk."), "Seuls les administrateurs des opérations et le personnel d'entrepôt peuvent utiliser le poste de l'entrepôt.");
  assert.equal(fr("Your role cannot read orders."), "Votre rôle ne permet pas de consulter les commandes.");
  assert.equal(localizeApiError("Your role cannot read orders.", "en"), "Your role cannot read orders.");
});

test("session and staff-suspension errors map to French", () => {
  const fr = (m) => localizeApiError(m, "fr");
  assert.equal(fr("You cannot switch off your own account."), "Vous ne pouvez pas désactiver votre propre compte.");
  assert.equal(fr("You cannot switch off the last active super admin."), "Vous ne pouvez pas désactiver le dernier super administrateur actif.");
  assert.equal(fr("Only staff accounts (riders, warehouse staff and administrators) can be switched on or off here."), "Seuls les comptes du personnel (livreurs, personnel d'entrepôt et administrateurs) peuvent être activés ou désactivés ici.");
  assert.equal(fr("Session has been revoked."), "Votre session a été fermée. Reconnectez-vous.");
  assert.equal(fr("Your session expired. Sign in again."), "Votre session a expiré. Reconnectez-vous.");
  assert.equal(fr("This token belongs to another account."), "Ce jeton appartient à un autre compte.");
});

test("the delivery code lockout sentences are French (RD-01)", () => {
  const fr = (m) => localizeApiError(m, "fr");
  const wrong = "Wrong delivery code. Ask the customer for the 4-digit code shown in their app.";
  assert.match(fr(wrong), /^Code de livraison incorrect\./);
  assert.equal(fr(`${wrong} 2 tries left before this step locks.`), "Code de livraison incorrect. Demandez au client le code à 4 chiffres affiché dans son application. Il vous reste 2 essais avant le verrouillage.");
  assert.match(fr(`${wrong} 1 try left before this step locks.`), /Il vous reste 1 essai avant/);
  assert.equal(
    fr("Too many wrong delivery codes. The code step is locked for 15 minutes. Ask the customer to confirm the code in their app, or call the warehouse."),
    "Trop de codes de livraison erronés. La saisie du code est verrouillée pendant 15 minutes. Demandez au client de confirmer le code dans son application, ou appelez l'entrepôt.",
  );
  assert.match(fr("Too many wrong delivery codes. The code step is locked for 1 minute. Ask the customer to confirm the code in their app, or call the warehouse."), /pendant 1 minute\./);
  assert.match(fr("Too many wrong delivery codes. The code step is locked until a warehouse supervisor unlocks it. Call the warehouse."), /jusqu'à ce qu'un superviseur de l'entrepôt/);
  assert.match(fr("Only a warehouse supervisor or an operations administrator can unlock a delivery code."), /^Seul un superviseur/);
  assert.equal(localizeApiError("This delivery code is not locked.", "en"), "This delivery code is not locked.");
});
