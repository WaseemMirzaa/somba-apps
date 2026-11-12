/**
 * The French version of an audit-log `detail`.
 *
 * Every audit entry is written with an English `detail` ("SOM-1001 -> shipped", "PO-1 $40 ref ABC", "2 area(s)"). The log is read in the
 * viewer's language, so a row also carries `detailFr`: the wording of the sentence in French, with references, names, codes, amounts
 * and free text kept as they were. `AuditLog` fills it itself before the row is inserted (see `audit-log.entity.ts`), so no writer can
 * forget it. A detail that is only data (a reference, a name, a code) has no wording to translate: `detailFr` stays null and readers
 * show `detail`.
 *
 * `api/src/ops/audit-detail-fr.spec.ts` scans the sources for the wording the server writes and fails on a sentence without French here.
 */

type Rule = readonly [RegExp, (m: RegExpExecArray) => string];

const NBSP = ' ';

/** "40" / "40.5" -> "40,50 $" (two decimals only when the amount has decimals, as the server wrote it). */
const usd = (n: string): string => `${n.replace('.', ',')}${NBSP}$`;

/** Words that appear inside a stored detail as English wording (never data). */
const STATUSES: Record<string, string> = {
  pending: 'en attente',
  approved: 'approuvé',
  rejected: 'refusé',
  suspended: 'suspendu',
  live: 'en ligne',
  draft: 'en brouillon',
  removed: 'retiré',
  cancelled: 'annulée',
  confirmed: 'confirmée',
  processing: 'en préparation',
  shipped: 'expédiée',
  out_for_delivery: 'en cours de livraison',
  delivered: 'livrée',
  returned: 'retournée',
};
const status = (s: string): string => STATUSES[s] ?? s;

/** Delivery legs as the log names them ("pickup", "return to seller"). */
const LEGS: Record<string, string> = {
  pickup: 'enlèvement',
  transfer: 'transfert',
  delivery: 'livraison',
  express: 'express',
  return_pickup: 'retour client',
  return_transfer: 'transfert retour',
  return_to_seller: 'retour au vendeur',
  replacement_delivery: 'livraison de remplacement',
};
const leg = (k: string): string => LEGS[k] ?? k;

const STAGES: Record<string, string> = { pickup: 'enlèvement', dropoff: 'dépôt' };

const RULES: Rule[] = [
  // Orders and payments
  [/^(\S+) \(status set to cancelled\)$/, (m) => `${m[1]} (statut passé à annulée)`],
  [/^(\S+) -> (\w+)$/, (m) => `${m[1]} -> ${status(m[2])}`],
  [/^(\S*) \$([\d.]+) to phone \(pawaPay\)$/, (m) => `${m[1]} ${usd(m[2])} vers le téléphone (pawaPay)`],
  [/^(\S*) \$([\d.]+) to card \(Stripe\)$/, (m) => `${m[1]} ${usd(m[2])} vers la carte (Stripe)`],
  [/^(\S*) \$([\d.]+) to wallet$/, (m) => `${m[1]} ${usd(m[2])} vers le portefeuille`],
  // Payouts
  [/^(\S+) \$([\d.]+) ref wallet \(batch\)$/, (m) => `${m[1]} ${usd(m[2])} réf. portefeuille (lot)`],
  [/^(\S+) \$([\d.]+) ref (.+) \(batch\)$/, (m) => `${m[1]} ${usd(m[2])} réf. ${m[3]} (lot)`],
  [/^(\S+) \$([\d.]+) ref wallet$/, (m) => `${m[1]} ${usd(m[2])} réf. portefeuille`],
  [/^(\S+) \$([\d.]+) ref (.+)$/, (m) => `${m[1]} ${usd(m[2])} réf. ${m[3]}`],
  [/^(\S+) \$([\d.]+) via pawaPay ?(.*)$/, (m) => `${m[1]} ${usd(m[2])} via pawaPay${m[3] ? ` ${m[3]}` : ''}`],
  // Catalogue and stores
  [/^(.+) \(was (\w+)\)$/, (m) => `${m[1]} (était : ${status(m[2])})`],
  [/^(.+) · (\d+) recipients · (.+)$/, (m) => `${m[1]} · ${m[2]} destinataire${m[2] === '1' ? '' : 's'} · ${m[3]}`],
  // Staff and security
  [/^temporary password replaced$/, () => 'mot de passe temporaire remplacé'],
  [/^none$/, () => 'aucun'],
  [/^Opened the proof of delivery\.$/, () => 'Preuve de livraison consultée.'],
  [
    /^A refresh token used at (\S+) was presented again; every session of the account was signed out\.$/,
    (m) => `Un jeton d’actualisation utilisé le ${m[1]} a été présenté de nouveau ; toutes les sessions du compte ont été fermées.`,
  ],
  // Riders
  [/^rider (\S+): created$/, (m) => `livreur ${m[1]} : créé`],
  [/^rider (\S+): (.+)$/, (m) => `livreur ${m[1]} : ${m[2]}`],
  [/^(\w+) of rider (\S+)(?:: (.+))?$/, (m) => `${m[1]} du livreur ${m[2]}${m[3] !== undefined ? ` : ${m[3]}` : ''}`],
  // Delivery codes
  [/^(\S+): wrong delivery code, try (\d+) \(rider (\S+)\)$/, (m) => `${m[1]} : code de livraison erroné, essai ${m[2]} (livreur ${m[3]})`],
  [
    /^(\S+): delivery code locked after (\d+) wrong tries \(rider (\S+)\), until a supervisor unlocks it$/,
    (m) => `${m[1]} : code de livraison verrouillé après ${m[2]} essais erronés (livreur ${m[3]}), jusqu’à ce qu’un superviseur le déverrouille`,
  ],
  [
    /^(\S+): delivery code locked after (\d+) wrong tries \(rider (\S+)\), for (\d+) minutes$/,
    (m) => `${m[1]} : code de livraison verrouillé après ${m[2]} essais erronés (livreur ${m[3]}), pendant ${m[4]} minutes`,
  ],
  [/^(\S+): delivery code unlocked by (.+) \(was at (\d+) wrong tries\)$/, (m) => `${m[1]} : code de livraison déverrouillé par ${m[2]} (en était à ${m[3]} essais erronés)`],
  // Parcels, tasks and runs
  [/^(\S+) (\w+) -> (\d+) return legs?$/, (m) => `${m[1]} ${leg(m[2])} -> ${m[3]} étape${m[3] === '1' ? '' : 's'} de retour`],
  [/^(\S+) (\w+) -> (.+)$/, (m) => `${m[1]} ${leg(m[2])} -> ${m[3]}`],
  [/^(\S+): (\S+) marked (\w+) by hand \((.*)\)$/, (m) => `${m[1]} : ${m[2]} marqué « ${STAGES[m[3]] ?? m[3]} » à la main (${m[4]})`],
  [/^(\S+) · (\d+) parcel\(s\)$/, (m) => `${m[1]} · ${m[2]} colis`],
  [/^(\S+) -> (\S+) · (\d+) parcel\(s\)$/, (m) => `${m[1]} -> ${m[2]} · ${m[3]} colis`],
  [/^(\S+) · (\d+) missing$/, (m) => `${m[1]} · ${m[2]} manquant${m[2] === '1' ? '' : 's'}`],
  // Areas and warehouse
  [/^(\d+) area\(s\)$/, (m) => `${m[1]} zone${m[1] === '1' ? '' : 's'}`],
  [
    /^Bin (\S+): (\d+) line\(s\) counted, variance ([+-]?\d+)(?: \((.*)\))?$/,
    (m) => `Emplacement ${m[1]} : ${m[2]} ligne${m[2] === '1' ? '' : 's'} comptée${m[2] === '1' ? '' : 's'}, écart ${m[3]}${m[4] !== undefined ? ` (${m[4]})` : ''}`,
  ],
  // Exchanges and replacements
  [/^(.*?) · (.*?) · \$([\d.]+) refunded to the customer's wallet on delivery$/, (m) => `${m[1]} · ${m[2]} · ${usd(m[3])} remboursés sur le portefeuille du client à la livraison`],
  [/^(.*?) · (.*?) · \$([\d.]+) refunded to the customer's wallet$/, (m) => `${m[1]} · ${m[2]} · ${usd(m[3])} remboursés sur le portefeuille du client`],
  [/^(.*?) · (.*?) · price difference \$([\d.]+)$/, (m) => `${m[1]} · ${m[2]} · différence de prix ${usd(m[3])}`],
  // Fraud alerts
  [/^(.+) · order (\S+)$/, (m) => `${m[1]} · commande ${m[2]}`],
];

/**
 * The French of an audit `detail`, or null when there is none to give (nothing in it needs translating, or it is empty).
 * Unknown wording comes back as null too, so a reader shows the English `detail`.
 */
export function auditDetailFr(detail: string | null | undefined): string | null {
  const text = typeof detail === 'string' ? detail.trim() : '';
  if (!text) return null;
  for (const [re, build] of RULES) {
    const m = re.exec(text);
    if (m) {
      const fr = build(m);
      return fr === text ? null : fr;
    }
  }
  return null;
}
