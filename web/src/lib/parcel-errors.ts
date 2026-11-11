/**
 * French for the parcel-scan errors the server answers with (`api/src/logistics/parcels.service.ts`, `parcel-rules.ts`).
 * The sentences carry a box code or a count, so they are patterns rather than exact strings. A sentence we do not know is
 * returned as it came (English beats hiding the problem), and a message that is already French passes through unchanged.
 *
 * Pure, no imports: `npm test` loads this file on its own. Meant to be merged into `api-errors.ts` later.
 */

const KIND_FR: Record<string, string> = {
  pickup: "cette collecte",
  transfer: "ce transfert",
  delivery: "cette livraison",
  "express delivery": "cette livraison express",
  "return pickup": "cette collecte de retour",
  "return transfer": "ce transfert de retour",
  "return to seller": "ce retour au vendeur",
  "replacement delivery": "cette livraison de remplacement",
};

const KIND_EN_ARTICLE = /^(?:a|an)\s+/;

type Rule = [RegExp, (m: RegExpExecArray) => string];

const RULES: Rule[] = [
  [/^(PKG-[A-Z0-9]+) is not part of this (.+)\.$/, (m) => `${m[1]} ne fait pas partie de ${KIND_FR[m[2].replace(KIND_EN_ARTICLE, "")] ?? "ce trajet"}.`],
  [/^(PKG-[A-Z0-9]+) was already scanned\.$/, (m) => `${m[1]} a déjà été scanné.`],
  [/^(PKG-[A-Z0-9]+) was cancelled; use the new label\.$/, (m) => `${m[1]} a été annulé ; utilisez la nouvelle étiquette.`],
  [/^That is not a KOMORIKO parcel code\. Codes look like (PKG-[A-Z0-9]+)\.$/, (m) => `Ce n'est pas un code colis KOMORIKO. Les codes ressemblent à ${m[1]}.`],
  [/^Collect (PKG-[A-Z0-9]+) first: this leg is not picked up yet\.$/, (m) => `Collectez d'abord ${m[1]} : ce trajet n'est pas encore collecté.`],
  [/^This leg is already closed\.$/, () => "Ce trajet est déjà clos."],
  [/^Scan every parcel first: (\d+) of (\d+) scanned\.$/, (m) => `Scannez tous les colis d'abord : ${m[1]} sur ${m[2]} scannés.`],
  [/^(PKG-[A-Z0-9]+) is not due at your warehouse\.$/, (m) => `${m[1]} n'est pas attendu dans votre entrepôt.`],
  [/^(PKG-[A-Z0-9]+) is not waiting to leave your warehouse\.$/, (m) => `${m[1]} n'attend pas de quitter votre entrepôt.`],
  [/^A rider must collect (PKG-[A-Z0-9]+) before it can be scanned in\.$/, (m) => `Un livreur doit d'abord collecter ${m[1]} avant qu'il puisse être scanné à l'arrivée.`],
  [/^Assign a rider before handing (PKG-[A-Z0-9]+) over\.$/, (m) => `Assignez un livreur avant de remettre ${m[1]}.`],
  [/^Only a supervisor or a manager can mark a parcel by hand\.$/, () => "Seuls un superviseur ou un responsable peuvent marquer un colis à la main."],
  [/^Give a reason, for example "label torn"\.$/, () => "Indiquez un motif, par exemple « étiquette déchirée »."],
  [/^Stage must be pickup or dropoff\.$/, () => "L'étape doit être la collecte ou la remise."],
  [/^The rider already scanned these boxes\. Contact support to change them\.$/, () => "Le livreur a déjà scanné ces cartons. Contactez l'assistance pour les modifier."],
  [/^Choose a warehouse: sign in as warehouse staff to scan a parcel code\.$/, () => "Choisissez un entrepôt : connectez-vous en tant que personnel d'entrepôt pour scanner un code colis."],
];

/** The server's parcel-scan sentence in the viewer's language; anything else is returned untouched. */
export function localizeParcelError(message: string, fr: boolean): string {
  if (!fr || !message) return message;
  const text = message.trim();
  for (const [re, make] of RULES) {
    const m = re.exec(text);
    if (m) return make(m);
  }
  return message;
}

/** The "Scan every parcel first: 2 of 3 scanned." refusal (English or French), with its numbers; null for any other message. */
export function parseScanFirst(message: string): { scanned: number; total: number } | null {
  const m = /^Scan every parcel first: (\d+) of (\d+) scanned\.$/.exec(message.trim()) ?? /^Scannez tous les colis d'abord : (\d+) sur (\d+) scannés\.$/.exec(message.trim());
  return m ? { scanned: Number(m[1]), total: Number(m[2]) } : null;
}

/** What a desk screen adds under a "scan every parcel first" refusal: scan the box codes, or a supervisor marks them by hand. */
export function scanFirstHint(fr: boolean): string {
  return fr
    ? "Scannez le code de chaque carton (PKG-…). Étiquette abîmée : un superviseur ou un responsable peut marquer le carton à la main."
    : "Scan each box's code (PKG-…). Damaged label: a supervisor or a manager can mark the box by hand.";
}

/** A server message in the viewer's language, with the desk hint added when it is the "scan every parcel first" refusal. */
export function parcelErrorWithHint(message: string, fr: boolean): string {
  const text = localizeParcelError(message, fr);
  return parseScanFirst(message) ? `${text} ${scanFirstHint(fr)}` : text;
}
