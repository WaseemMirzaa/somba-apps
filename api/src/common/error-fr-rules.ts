/**
 * French sentences for the server messages that carry a dynamic part (a number, a name, a reference, a status).
 *
 * The first block is the list the web client has used so far (`web/src/lib/api-errors.ts`, same wording), moved here
 * so the server can send it; the second block covers what no client list had (see `OWN_RULES`). Each rule is
 * `[pattern on the English sentence, builder of the French one]`; dynamic parts (names, references, free text)
 * pass through as they were written, amounts are written the French way (`52,00 $`).
 *
 * To add a message: put its exact sentence in `error-fr-exact.ts`, or add a rule here when it has a variable part.
 * `error-fr.spec.ts` scans `api/src` and fails when a message a user can see has no French.
 */

import { afterSaleStepFr, fieldFr, legKindFr, legStatusFr, moneyFr, ofField, statusFr } from './error-fr-fields';

export type FrRule = readonly [RegExp, (m: RegExpExecArray) => string];

const AREA_LEVEL_ADD_FR: Record<string, string> = { country: "un pays", province: "une province", city: "une ville", district: "un district", commune: "une commune", quartier: "un quartier" };
const areaField = fieldFr;

/** French for the reasons of a refused account deletion, or null when one of them is not known. */
const BLOCKED_REASONS: FrRule[] = [
  [/^Your wallet still holds \$([\d.,]+): spend it or ask support to pay it out first\./, (m) => `Votre portefeuille contient encore ${moneyFr(m[1])} : dépensez-le ou demandez à l’assistance de vous le verser d’abord.`],
  [/^You have (\d+) orders? that (?:is|are) not finished yet: [^.]*?first\./, (m) => (m[1] === "1" ? "Vous avez 1 commande qui n’est pas terminée : attendez qu’elle soit livrée, ou annulez-la, d’abord." : `Vous avez ${m[1]} commandes qui ne sont pas terminées : attendez qu’elles soient livrées, ou annulez-les, d’abord.`)],
  [/^You have (\d+) open return, exchange or replacement requests?: [^.]*?first\./, (m) => (m[1] === "1" ? "Vous avez 1 demande de retour, d’échange ou de remplacement en cours : attendez qu’elle soit terminée d’abord." : `Vous avez ${m[1]} demandes de retour, d’échange ou de remplacement en cours : attendez qu’elles soient terminées d’abord.`)],
  [/^You have (\d+) open disputes? about an order: [^.]*?first\./, (m) => (m[1] === "1" ? "Vous avez 1 litige en cours au sujet d’une commande : attendez qu’il soit résolu d’abord." : `Vous avez ${m[1]} litiges en cours au sujet d’une commande : attendez qu’ils soient résolus d’abord.`)],
  [/^You have (\d+) open support requests? about an order: [^.]*?first\./, (m) => (m[1] === "1" ? "Vous avez 1 demande d’assistance en cours au sujet d’une commande : attendez que l’assistance la clôture d’abord." : `Vous avez ${m[1]} demandes d’assistance en cours au sujet d’une commande : attendez que l’assistance les clôture d’abord.`)],
  [/^A payout to you is still being processed: wait until it is paid first\./, () => "Un versement qui vous est destiné est encore en cours de traitement : attendez qu’il soit payé d’abord."],
  [/^A refund to your phone or card is still on its way: wait until it arrives first\./, () => "Un remboursement vers votre téléphone ou votre carte est encore en route : attendez son arrivée d’abord."],
  [/^A wallet top-up is still waiting for your approval: wait until it completes or fails first\./, () => "Une recharge du portefeuille attend encore votre validation : attendez qu’elle aboutisse ou échoue d’abord."],
];

function accountBlockedFr(reasons: string): string | null {
  const out: string[] = [];
  let rest = reasons.trim();
  while (rest) {
    const hit = BLOCKED_REASONS.map(([re, fn]) => ({ m: re.exec(rest), fn })).find((x) => x.m);
    if (!hit || !hit.m) return null;
    out.push(hit.fn(hit.m));
    rest = rest.slice(hit.m[0].length).trim();
  }
  return out.length ? `Vous ne pouvez pas encore supprimer votre compte. ${out.join(" ")}` : null;
}

const WEB_RULES: FrRule[] = [
  // ── rider vehicle and compliance documents ──
  [/^(Insurance valid until|Last service|Next service|Expiry date) must be a date written YYYY-MM-DD\.$/, (m) => `${{ "Insurance valid until": "La fin de l’assurance", "Last service": "Le dernier entretien", "Next service": "Le prochain entretien", "Expiry date": "La date d’expiration" }[m[1]]} : une date au format AAAA-MM-JJ.`],
  [/^(Type|Fuel|Document type) must be one of: .+\.$/, (m) => `${{ Type: "Le type de véhicule", Fuel: "Le carburant", "Document type": "Le type de document" }[m[1]]} n’est pas valide.`],
  // ── warehouse stock ledger ──
  [/^Bin (.+) holds only (\d+) of (.+): you cannot take (\d+)\.$/, (m) => `L’emplacement ${m[1]} ne contient que ${m[2]} × ${m[3]} : vous ne pouvez pas en prendre ${m[4]}.`],
  [/^Bin (.+) holds no (.+)\.$/, (m) => `L’emplacement ${m[1]} ne contient aucun ${m[2]}.`],
  [/^Bin (.+) is switched off\. Choose another bin\.$/, (m) => `L’emplacement ${m[1]} est désactivé. Choisissez-en un autre.`],
  [/^Bin (.+) already exists in this warehouse\.$/, (m) => `L’emplacement ${m[1]} existe déjà dans cet entrepôt.`],
  [/^Bin (.+) still holds stock\. Move it or count it out first\.$/, (m) => `L’emplacement ${m[1]} contient encore du stock. Déplacez-le ou sortez-le d’abord.`],
  [/^(.+) from this parcel is already in stock\.$/, (m) => `${m[1]} de ce colis est déjà en stock.`],
  [/^This parcel carries (\d+) more of (.+): you cannot put away (\d+)\.$/, (m) => `Ce colis contient encore ${m[1]} × ${m[2]} : vous ne pouvez pas en ranger ${m[3]}.`],
  [/^Reason must be one of: .+\.$/, () => "Le motif n’est pas valide."],
  [/^Enter the counted number of (.+) \(0 or more\)\.$/, (m) => `Saisissez la quantité comptée de ${m[1]} (0 ou plus).`],
  [/^(.+) is on the sheet twice\.$/, (m) => `${m[1]} figure deux fois sur la feuille.`],
  [/^(.+) in bin (.+) changed while you were counting \(now (\d+)\)\. Refresh and count again\.$/, (m) => `${m[1]} dans l’emplacement ${m[2]} a changé pendant le comptage (maintenant ${m[3]}). Actualisez et recomptez.`],
  [/^(.+) in bin (.+) was just updated\. Refresh and count again\.$/, (m) => `${m[1]} dans l’emplacement ${m[2]} vient d’être mis à jour. Actualisez et recomptez.`],
  [/^Wrong delivery code\. Ask the customer for the 4-digit code shown in their app\. (\d+) tr(?:y|ies) left before this step locks\.$/, (m) => `Code de livraison incorrect. Demandez au client le code à 4 chiffres affiché dans son application. Il vous reste ${m[1]} ${m[1] === "1" ? "essai" : "essais"} avant le verrouillage.`],
  [/^Too many wrong delivery codes\. The code step is locked for (\d+) minutes?\. Ask the customer to confirm the code in their app, or call the warehouse\.$/, (m) => `Trop de codes de livraison erronés. La saisie du code est verrouillée pendant ${m[1]} ${m[1] === "1" ? "minute" : "minutes"}. Demandez au client de confirmer le code dans son application, ou appelez l’entrepôt.`],
  [/^(.+) must be (\d+)-(\d+) characters\.$/, (m) => `${areaField(m[1])} : ${m[2]} à ${m[3]} caractères.`],
  [/^(.+) must be (?:a number|a whole number) between (\d+) and (\d+)\.$/, (m) => `${areaField(m[1])} : un nombre entre ${m[2]} et ${m[3]}.`],
  [/^Level must be one of: .+\.$/, () => "Le niveau doit être : pays, province, ville, district, commune ou quartier."],
  [/^A (\w+) cannot be added under a (\w+)\.$/, (m) => `Impossible d’ajouter ${AREA_LEVEL_ADD_FR[m[1]] ?? m[1]} sous ${AREA_LEVEL_ADD_FR[m[2]] ?? m[2]}.`],
  [/^Parcel missing from run (.+)\.$/, (m) => `Colis manquant dans la tournée ${m[1]}.`],
  [/^This area is already covered by (.+)\.$/, (m) => `Cette zone est déjà couverte par ${m[1]}.`],
  [/^We don[’']t deliver to (.+) yet\.$/, (m) => `Nous ne livrons pas encore à ${m[1]}.`],
  [/^Returns are accepted within (\d+) days? of delivery, and that time has passed\.$/, (m) => `Les retours sont acceptés dans les ${m[1]} jours suivant la livraison, et ce délai est dépassé.`],
  [/^You can return at most (\d+) of "(.+)"\.$/, (m) => `Vous pouvez retourner au maximum ${m[1]} × « ${m[2]} ».`],
  [/^That is more than what is left to refund on this order \(\$([\d.,]+)\)\.$/, (m) => `C’est plus que ce qu’il reste à rembourser sur cette commande (${moneyFr(m[1])}).`],
  [/^pawaPay refused the refund: (.+)$/, (m) => `pawaPay a refusé le remboursement : ${m[1]}`],
  [/^Put back between 0 and (\d+) of "(.+)"\.$/, (m) => `Remettez en rayon entre 0 et ${m[1]} × « ${m[2]} ».`],
  [/^Choose a (.+) for "(.+)"\.$/, (m) => `Choisissez : ${m[1]} pour « ${m[2]} ».`],
  [/^Your wallet balance is too low for the price difference \(\$([\d.,]+)\)\. Top up your wallet and try again\.$/, (m) => `Le solde de votre portefeuille est trop bas pour la différence de prix (${moneyFr(m[1])}). Rechargez-le et réessayez.`],
  [/^Can't move from (\w+) to (\w+)\.$/, (m) => `Passage impossible de « ${afterSaleStepFr(m[1])} » à « ${afterSaleStepFr(m[2])} ».`],
  [/^A campaign that is (\w+) cannot become (\w+)\.$/, (m) => `Une campagne « ${statusFr(m[1])} » ne peut pas passer à « ${statusFr(m[2])} ».`],
  [/^Only (\d+) of "(.+)" \((.+)\) left in stock\.$/, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » (${m[3]}) en stock.`],
  [/^Only (\d+) of "(.+)" left in stock\.$/, (m) => `Il ne reste que ${m[1]} × « ${m[2]} » en stock.`],
  [/^"(.+)" \((.+)\) is out of stock\.$/, (m) => `« ${m[1]} » (${m[2]}) est en rupture de stock.`],
  [/^"(.+)" is out of stock\.$/, (m) => `« ${m[1]} » est en rupture de stock.`],
  [/^There are only (\d+) in stock for "(.+)": you cannot remove (\d+)\.$/, (m) => `Il n’y en a que ${m[1]} en stock pour « ${m[2]} » : vous ne pouvez pas en retirer ${m[3]}.`],
  [/^Stock for "(.+)" must be a whole number from 0 to 1,000,000\.$/, (m) => `Le stock de « ${m[1]} » doit être un nombre entier de 0 à 1 000 000.`],
  [/^Total stock \((\d+)\) is below the stock set per option \((\d+)\)\.$/, (m) => `Le stock total (${m[1]}) est inférieur au stock défini par option (${m[2]}).`],
  [/^Picture (\d+) must be an upload or a secure \(https\) link\.$/, (m) => `La photo ${m[1]} doit être un fichier téléversé ou un lien sécurisé (https).`],
  [/^The SKU "(.+)" is already used by another of your products\.$/, (m) => `Le SKU « ${m[1]} » est déjà utilisé par un autre de vos produits.`],
  [/^The SKU "(.+)" appears twice in this file\.$/, (m) => `Le SKU « ${m[1]} » apparaît deux fois dans ce fichier.`],
  [/^Your (.+) plan allows (\d+) listings?: upgrade it to add more\.$/, (m) => `Votre offre ${m[1]} autorise ${m[2]} annonce(s) : passez à une offre supérieure pour en ajouter.`],
  [/^Your (.+) plan does not include (.+)\. Upgrade your plan to use it\.$/, (m) => `Votre offre ${m[1]} n’inclut pas ${planPerkFr(m[2])}. Passez à une offre supérieure pour l’utiliser.`],
  [/^Your (.+) plan allows (\d+) team members?\. Upgrade your plan to invite more\.$/, (m) => `Votre offre ${m[1]} autorise ${m[2]} membre(s) d’équipe. Passez à une offre supérieure pour en inviter davantage.`],
  [/^Your team role \((\w+)\) does not allow this\. Ask the store owner\.$/, (m) => `Votre rôle d’équipe (${m[1]}) ne permet pas cette action. Demandez au propriétaire de la boutique.`],
  [/^This coupon only applies to products from (.+)\.$/, (m) => `Ce coupon ne s’applique qu’aux produits de ${m[1]}.`],
  [/^There were no sales in (\d{4}-\d{2}): nothing to invoice\.$/, (m) => `Aucune vente en ${m[1]} : rien à facturer.`],
  [/^Status must be one of: pending, .*to_pack, ready, at_hub\.$/, () => "Statut invalide pour ce filtre."],
  // A customer deleting the account while something is outstanding (api/src/auth/account-deletion.service.ts): one message,
  // one sentence per reason. A reason this site does not know leaves the whole message in English.
  [/^You cannot delete your account yet\. (.+)$/, (m) => accountBlockedFr(m[1]) ?? m[0]],
  [/^You still have (\d+) orders? in progress\. Finish or cancel them before deleting your account\.$/, (m) => `Vous avez encore ${m[1]} commande(s) en cours. Terminez-les ou annulez-les avant de supprimer votre compte.`],
  [/^A payout is still being processed\. Wait until it is paid before deleting your account\.$/, () => "Un versement est en cours de traitement. Attendez qu’il soit payé avant de supprimer votre compte."],
  [/^You still have \$([\d.,]+) to withdraw\. Request a payout first, then delete your account\.$/, (m) => `Il vous reste ${moneyFr(m[1])} à retirer. Demandez d’abord un versement, puis supprimez votre compte.`],
  [/^Revenue goal must be a number from 0 to 1000000000\.$/, () => "L’objectif de revenus doit être un nombre de 0 à 1 000 000 000."],
  [/^(Orders|Rating|Listings) goal must be a number .*$/, (m) => `L’objectif « ${m[1]} » doit être un nombre valide.`],
  [/^Unknown notification kind: (.+)\.$/, (m) => `Type de notification inconnu : ${m[1]}.`],
  [/^This invitation was sent to another e-mail address\. Sign in with (.+)\.$/, (m) => `Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec ${m[1]}.`],
  [/^Minimum order \$([\d.,]+)\.$/, (m) => `Commande minimum : ${moneyFr(m[1])}.`],
  [/^Not enough stock .*$/, () => "Stock insuffisant."],
  [/^(.+) is on vacation until .+ and is not taking new orders\. \/ (.+)$/, (m) => m[2]],
];

function planPerkFr(perk: string): string {
  const p = perk.toLowerCase();
  if (p.includes("coupon")) return "les coupons vendeur";
  if (p.includes("flash")) return "les ventes flash";
  if (p.includes("import")) return "l’import en masse";
  if (p.includes("promotion")) return "les promotions";
  if (p.includes("team")) return "les comptes d’équipe";
  return perk;
}


/**
 * Rules written for the server (messages the three client lists never covered), then the generic validator
 * sentences. Order matters: the first rule that matches wins, so specific sentences come before `{label} must ...`.
 */
const plural = (n: string, one: string, many: string): string => (n === '1' ? one : many);
const money = (v: string): string => moneyFr(v);

const OWN_RULES: FrRule[] = [
  // ── Express: a path that does not exist ──
  [/^Cannot (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+$/, () => 'Ressource introuvable.'],
  // ── class-validator defaults (the sign-up, login and reset forms) ──
  [/^email must be an email$/, () => 'Saisissez un e-mail valide.'],
  [/^(\w+) must be a string$/, (m) => `Le champ « ${m[1]} » est obligatoire.`],
  [/^(\w+) should not be empty$/, (m) => `Le champ « ${m[1]} » est obligatoire.`],
  [/^(\w+) must be one of the following values: .+$/, (m) => `Le champ « ${m[1]} » n’est pas valide.`],
  [/^(\w+) must be longer than or equal to (\d+) characters$/, (m) => `Le champ « ${m[1]} » doit contenir au moins ${m[2]} caractères.`],

  // ── cart, chat, attachments, follows ──
  [/^At most (\d+) lines\.$/, (m) => `Au maximum ${m[1]} lignes.`],
  [/^A message can have up to (\d+) characters\.$/, (m) => `Un message peut contenir jusqu’à ${m[1]} caractères.`],
  [/^Attach up to (\d+) photos\.$/, (m) => `Joignez ${m[1]} photos au maximum.`],
  [/^You can attach up to (\d+) photos\.$/, (m) => `Vous pouvez joindre jusqu’à ${m[1]} photos.`],
  [/^You can follow up to (\d+) stores\. Unfollow one first\.$/, (m) => `Vous pouvez suivre ${m[1]} boutiques au maximum. Cessez d’abord d’en suivre une.`],

  // ── product options, pictures, imports ──
  [/^At most (\d+) option types \(e\.g\. size and colour\)\.$/, (m) => `Au maximum ${m[1]} types d’options (par exemple taille et couleur).`],
  [/^"(.+)" is listed twice\.$/, (m) => `« ${m[1]} » est indiqué deux fois.`],
  [/^Add at least one value for "(.+)"\.$/, (m) => `Ajoutez au moins une valeur pour « ${m[1]} ».`],
  [/^At most (\d+) values for "(.+)"\.$/, (m) => `Au maximum ${m[1]} valeurs pour « ${m[2]} ».`],
  [/^"(.+)" has the same value twice\.$/, (m) => `« ${m[1]} » a deux fois la même valeur.`],
  [/^At most (\d+) pictures per product\.$/, (m) => `Au maximum ${m[1]} photos par produit.`],
  [/^The file could not be downloaded \((.+)\)\.$/, (m) => `Le fichier n’a pas pu être téléchargé (${m[1]}).`],
  [/^Import at most (\d+) products at a time\.$/, (m) => `Importez ${m[1]} produits au maximum à la fois.`],
  [/^(.+) link is too long\.$/, (m) => `Le lien ${ofField(m[1])} est trop long.`],
  [/^(.+) link is not valid\.$/, (m) => `Le lien ${ofField(m[1])} n’est pas valide.`],
  [/^(.+) is empty\.$/, (m) => `${fieldFr(m[1])} est vide.`],
  [/^(.+) must be an upload or a secure \(https\) link\.$/, (m) => `${fieldFr(m[1])} doit être un fichier téléversé ou un lien sécurisé (https).`],
  [/^(.+) must be a list of links\.$/, (m) => `${fieldFr(m[1])} doit être une liste de liens.`],
  [/^(.+) must be an image uploaded through the platform\.$/, (m) => `${fieldFr(m[1])} doit être une image téléversée sur la plateforme.`],
  [/^(.+) is not a valid image\.$/, (m) => `${fieldFr(m[1])} n’est pas une image valide.`],
  [/^The (.+) is too large \((\d+) MB at most\)\.$/, (m) => `${fieldFr(m[1])} est trop volumineuse (${m[2]} Mo au maximum).`],
  [/^The (.+) must be a PNG image\.$/, (m) => `${fieldFr(m[1])} doit être une image PNG.`],
  [/^The (.+) must be a JPEG or PNG image\.$/, (m) => `${fieldFr(m[1])} doit être une image JPEG ou PNG.`],

  // ── plans, coupons, flash sales ──
  [/^Plan perk (.+) must be true or false\.$/, (m) => `L’option « ${m[1]} » de l’offre doit être « vrai » ou « faux ».`],
  [/^A store can hold (\d+) coupons: delete one you no longer use\.$/, (m) => `Une boutique peut avoir ${m[1]} coupons au maximum : supprimez-en un que vous n’utilisez plus.`],
  [/^The flash price must be below the normal price \(\$([\d.,]+)\)\.$/, (m) => `Le prix flash doit être inférieur au prix normal (${money(m[1])}).`],
  [/^This coupon applies to one store[’']s products: add them to your cart first\.$/, () => 'Ce coupon s’applique aux produits d’une seule boutique : ajoutez-les d’abord à votre panier.'],

  // ── orders, stock, wallet ──
  [/^Quantity must be a whole number from 1 to (\d+)\.$/, (m) => `La quantité doit être un nombre entier de 1 à ${m[1]}.`],
  [/^"(.+)" is not available\.$/, (m) => `« ${m[1]} » n’est pas disponible.`],
  [/^"(.+)" just sold out or has too little stock left\.$/, (m) => `« ${m[1]} » est épuisé ou n’a plus assez de stock.`],
  [/^Only (\d+) of (.+) left in stock\.$/, (m) => `Il ne reste que ${m[1]} × ${m[2]} en stock.`],
  [/^(.+) is out of stock\.$/, (m) => `${m[1]} est en rupture de stock.`],
  [/^Insufficient wallet balance \(\$([\d.,]+) < \$([\d.,]+)\)\.$/, (m) => `Solde du portefeuille insuffisant (${money(m[1])} sur ${money(m[2])} nécessaires).`],
  [/^An order that is (.+) cannot be marked ready\.$/, (m) => `Une commande « ${statusFr(m[1])} » ne peut pas être marquée comme prête.`],
  [/^An order that is (.+) can no longer be cancelled by the seller\.$/, (m) => `Une commande « ${statusFr(m[1])} » ne peut plus être annulée par le vendeur.`],
  [/^Cannot move an order from (.+) to (.+)\.$/, (m) => `Impossible de faire passer une commande de « ${statusFr(m[1])} » à « ${statusFr(m[2])} ».`],
  [/^Order can no longer be cancelled \(status: (.+)\)\.$/, (m) => `Cette commande ne peut plus être annulée (statut : ${statusFr(m[1])}).`],
  [/^This payment is already (\w+)\.$/, (m) => `Ce paiement est déjà ${statusFr(m[1])}.`],
  [/^Top-up method must be one of: (.+)\.$/, (m) => `Le moyen de recharge doit être l’un des suivants : ${m[1]}.`],
  [/^Pay with your wallet or mobile money \((.+)\)\.$/, (m) => `Payez avec votre portefeuille ou par mobile money (${m[1]}).`],
  [/^Stripe refused the refund: (.+)$/, (m) => `Stripe a refusé le remboursement : ${m[1]}`],
  [/^pawaPay refused the payout: (.+)$/, (m) => `pawaPay a refusé le versement : ${m[1]}`],
  [/^There (?:is|are) only (\d+) in stock for "(.+)": you cannot remove (\d+)\.$/, (m) => `Il n’y en a que ${m[1]} en stock pour « ${m[2]} » : vous ne pouvez pas en retirer ${m[3]}.`],
  [/^There (?:is|are) only (\d+) in stock: you cannot remove (\d+)\.$/, (m) => `Il n’y en a que ${m[1]} en stock : vous ne pouvez pas en retirer ${m[2]}.`],
  [/^Your (.+) plan allows (\d+) listings\. Upgrade your plan to add more\.$/, (m) => `Votre offre ${m[1]} autorise ${m[2]} annonce(s). Passez à une offre supérieure pour en ajouter.`],
  [/^The low-stock alert must be a whole number from 0 to (\d+)\.$/, (m) => `L’alerte de stock bas doit être un nombre entier de 0 à ${m[1]}.`],
  [/^A batch at this warehouse holds at most (\d+) parcels\.$/, (m) => `Un lot dans cet entrepôt contient ${m[1]} colis au maximum.`],

  // ── payouts ──
  [/^The minimum payout is \$([\d.,]+)\.$/, (m) => `Le versement minimum est de ${money(m[1])}.`],
  [/^You can withdraw up to \$([\d.,]+) right now\.$/, (m) => `Vous pouvez retirer jusqu’à ${money(m[1])} pour le moment.`],
  [/^Refunds and returns left your balance at -\$([\d.,]+): nothing can be withdrawn until new sales cover it\.$/, (m) => `Les remboursements et retours ont ramené votre solde à -${money(m[1])} : rien ne peut être retiré tant que de nouvelles ventes ne le couvrent pas.`],
  [/^Approve at most (\d+) payouts at a time\.$/, (m) => `Approuvez ${m[1]} versements au maximum à la fois.`],
  [/^You still have (\d+) orders? in progress\. Finish or cancel it before deleting your account\.$/, (m) => `Vous avez encore ${m[1]} ${plural(m[1], 'commande', 'commandes')} en cours. Terminez-${plural(m[1], 'la', 'les')} ou annulez-${plural(m[1], 'la', 'les')} avant de supprimer votre compte.`],
  [/^There were no sales in (.+): nothing to invoice\.$/, (m) => `Aucune vente en ${m[1]} : rien à facturer.`],

  // ── delivery and warehouse ──
  [/^An? (.+?) that is (.+?) cannot become (.+)\.$/, (m) => `${legKindFr(m[1])} « ${legStatusFr(m[1], m[2])} » ne peut pas passer à « ${legStatusFr(m[1], m[3])} ».`],
  [/^Collect (.+) first: this leg is not picked up yet\.$/, (m) => `Faites d’abord récupérer ${m[1]} : cette étape n’est pas encore récupérée.`],
  [/^A rider must collect (.+) before it can be scanned in\.$/, (m) => `Un livreur doit d’abord récupérer ${m[1]} avant son enregistrement à l’arrivée.`],
  [/^Assign a rider before handing (.+) over\.$/, (m) => `Assignez un livreur avant de remettre ${m[1]}.`],
  [/^Boxes must be a whole number from 1 to (\d+)\.$/, (m) => `Le nombre de colis doit être un nombre entier de 1 à ${m[1]}.`],
  [/^Enter a whole number of (.+), at least 1\.$/, (m) => `Saisissez un nombre entier de ${m[1] === 'units' ? 'unités' : m[1]}, au moins 1.`],
  [/^Choose a period of at most (\d+) days\.$/, (m) => `Choisissez une période de ${m[1]} jours au maximum.`],
  [/^Choose a role: (.+)\.$/, (m) => `Choisissez un rôle : ${m[1]}.`],

  // ── generic validator sentences: `{label} must be ...` (labels come from FIELD_FR) ──
  [/^Handling time must be a whole number of days from 0 to (\d+)\.$/, (m) => `Le délai de préparation doit être un nombre entier de jours de 0 à ${m[1]}.`],
  [/^(.+) must be (a whole number|a number) between (-?[\d.]+) and (-?[\d.]+)\.$/, (m) => `${fieldFr(m[1])} : ${m[2] === 'a number' ? 'un nombre' : 'un nombre entier'} entre ${m[3]} et ${m[4]}.`],
  [/^(.+) must be (a whole number|a number) of at least (-?[\d.]+)\.$/, (m) => `${fieldFr(m[1])} : ${m[2] === 'a number' ? 'un nombre' : 'un nombre entier'} d’au moins ${m[3]}.`],
  [/^(.+) must be (a whole number|a number) from (-?[\d.]+) to (-?[\d.]+)\.$/, (m) => `${fieldFr(m[1])} : ${m[2] === 'a number' ? 'un nombre' : 'un nombre entier'} de ${m[3]} à ${m[4]}.`],
  [/^(.+) must be (a whole number|a number)\.$/, (m) => `${fieldFr(m[1])} doit être ${m[2] === 'a number' ? 'un nombre' : 'un nombre entier'}.`],
  [/^(.+) must be (\d+) characters\.$/, (m) => `${fieldFr(m[1])} : exactement ${m[2]} caractères.`],
  [/^(.+) must be at most (\d+) characters\.$/, (m) => `${fieldFr(m[1])} : ${m[2]} caractères au maximum.`],
  [/^(.+) must be one of: .+\.$/, (m) => `${fieldFr(m[1])} n’est pas valide.`],
  [/^(.+) must be text\.$/, (m) => `${fieldFr(m[1])} doit être du texte.`],
  [/^(.+) must be true or false\.$/, (m) => `${fieldFr(m[1])} doit être « vrai » ou « faux ».`],
  [/^(.+) must be a valid date\.$/, (m) => `${fieldFr(m[1])} doit être une date valide.`],
  [/^(.+) is not a valid date\.$/, (m) => `${fieldFr(m[1])} n’est pas une date valide.`],
  [/^(.+) must be a date like (\d{4}-\d{2}-\d{2})\.$/, (m) => `${fieldFr(m[1])} : une date au format AAAA-MM-JJ (par exemple ${m[2]}).`],
  [/^(.+) must be a date written YYYY-MM-DD\.$/, (m) => `${fieldFr(m[1])} : une date au format AAAA-MM-JJ.`],
  [/^(.+) must be a time like (\d{2}:\d{2})\.$/, (m) => `${fieldFr(m[1])} : une heure au format ${m[2]}.`],
  [/^(.+) must be a list of up to (\d+) items\.$/, (m) => `${fieldFr(m[1])} doit être une liste de ${m[2]} éléments au maximum.`],
  [/^(.+) is not a list\.$/, (m) => `${fieldFr(m[1])} n’est pas une liste.`],
];

export const ERROR_FR_RULES: readonly FrRule[] = [...WEB_RULES, ...OWN_RULES];
