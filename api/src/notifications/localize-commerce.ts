/**
 * French versions of the notices the commerce side sends: stock, flash sales, campaign budget and rejection, commission
 * invoices, bulk import, and how a payout ended (for the super admin). Merged into the tables of `localize.ts`
 * (first match wins, so these sit above its general "X is now Y." rule). `notice-coverage.spec.ts` fails the build when
 * a notice sent from the sources has no entry here or there.
 */

export type CommerceRule = readonly [RegExp, (m: RegExpExecArray) => string];

const NBSP = ' ';

/** "52.00" -> "52,00 $" (comma decimals, non-breaking spaces), as `moneyFr` in localize.ts. */
const usd = (amount: string): string => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) return `${amount}${NBSP}$`;
  return `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${m[2] !== undefined ? `,${m[2]}` : ''}${NBSP}$`;
};

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** "2026-10" -> "octobre 2026" */
const monthFr = (p: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${MONTHS_FR[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : p;
};

/** "2026-10-26 10:00 UTC" -> "26/10/2026 10:00 UTC" */
const whenFr = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : s;
};

export const COMMERCE_TITLES: Record<string, string> = {
  'Low stock': 'Stock bas',
  'Out of stock': 'Rupture de stock',
  'Low stock alert': 'Alerte de stock bas',
  'Flash sale started': 'Vente flash démarrée',
  'Flash sale scheduled': 'Vente flash programmée',
  'Flash sale ended': 'Vente flash terminée',
  'Flash sale nominated': 'Vente flash proposée',
  'Flash sale approved': 'Vente flash approuvée',
  'Flash sale declined': 'Vente flash refusée',
  'Campaign budget used': 'Budget de campagne épuisé',
  'Commission invoice ready': 'Facture de commission disponible',
  'Payout settled': 'Versement réglé',
  'Payout declined': 'Versement refusé par la finance',
};

export const COMMERCE_BODIES: CommerceRule[] = [
  // Stock
  [/^(.+) is down to (\d+) \(alert at (\d+)\)\. Restock soon\.$/, (m) => `${m[1]} : plus que ${m[2]} en stock (alerte à ${m[3]}). Pensez à réapprovisionner.`],
  [
    /^(.+) is out of stock\. Shoppers cannot buy it until you restock\.$/,
    (m) => `${m[1]} est en rupture de stock. Les clients ne peuvent plus l’acheter tant que vous ne réapprovisionnez pas.`,
  ],
  [/^(.+) from (.+) is out of stock\.$/, (m) => `${m[1]} de ${m[2]} est en rupture de stock.`],
  [/^(.+) from (.+) is down to (\d+)\.$/, (m) => `${m[1]} de ${m[2]} : plus que ${m[3]} en stock.`],

  // Campaigns
  [/^"(.+)" used its \$([\d.]+) budget; prices are back to normal\.$/, (m) => `« ${m[1]} » a utilisé tout son budget de ${usd(m[2])} ; les prix sont revenus à la normale.`],
  [/^"(.+)" was rejected: ([\s\S]+)$/, (m) => `« ${m[1]} » a été refusée : ${m[2]}`],

  // Flash sales (before the general "X is now Y." rule)
  [/^(.+) goes on flash sale at \$([\d.]+) from (.+)\.$/, (m) => `${m[1]} passe en vente flash à ${usd(m[2])} à partir du ${whenFr(m[3])}.`],
  [/^(.+) is now on flash sale at \$([\d.]+)\.$/, (m) => `${m[1]} est maintenant en vente flash à ${usd(m[2])}.`],
  [/^(.+): the flash sale has ended; the price is back to normal\.$/, (m) => `${m[1]} : la vente flash est terminée ; le prix est revenu à la normale.`],
  [/^(.+) proposes (.+) at \$([\d.]+)\.$/, (m) => `${m[1]} propose ${m[2]} à ${usd(m[3])}.`],
  [/^Your flash sale for (.+) was approved\.$/, (m) => `Votre vente flash pour ${m[1]} a été approuvée.`],
  [/^Your flash sale for (.+) was declined: ([\s\S]+)$/, (m) => `Votre vente flash pour ${m[1]} a été refusée : ${m[2]}`],

  // Invoices and imports
  [/^Your commission invoice (\S+) for (\d{4}-\d{2}) is ready\.$/, (m) => `Votre facture de commission ${m[1]} pour ${monthFr(m[2])} est disponible.`],
  [/^(\d+) products imported by (.+) need moderation\.$/, (m) => `${m[1]} produits importés par ${m[2]} sont à modérer.`],

  // How a payout ended (the super admin's copy)
  [
    /^(\S+) · (.+) · \$([\d.]+) was paid( through pawaPay)?\.$/,
    (m) => `${m[1]} · ${m[2]} · ${usd(m[3])} réglé${m[4] !== undefined ? ' via pawaPay' : ''}.`,
  ],
  [/^(\S+) · (.+) · \$([\d.]+) was rejected(?: \((.+)\))?\.$/, (m) => `${m[1]} · ${m[2]} · ${usd(m[3])} refusé${m[4] !== undefined ? ` (${m[4]})` : ''}.`],
];
