/**
 * French versions of the notices and wallet lines the server writes in English.
 *
 * Notifications are stored in English (one row, no per-language columns); a French recipient gets the text below in
 * the push, in the live `notification:new` event and in the list (`titleFr` / `bodyFr`). A port of the customer
 * app's `mobile/lib/l10n/notification_text.dart`, widened to every notice the API sends so French users never get
 * English. Wording in the titles and patterns must follow the sources: `localize.spec.ts` scans `api/src` and fails
 * on a title or body that has no French.
 *
 * Dynamic parts (order references, product and store names, free text typed by people) pass through as is. Amounts are
 * re-formatted the French way (`52,00 $`: comma decimals, non-breaking spaces; see `moneyFr`).
 */

import { paymentMethodId } from '../common/payment-method';

export interface NoticeText {
  title: string;
  body: string;
}

type Rule = readonly [RegExp, (m: RegExpExecArray) => string];

// ── Helpers ──────────────────────────────────────────────────────────────

const METHODS_FR: Record<string, string> = {
  airtel_money: 'Airtel Money',
  orange_money: 'Orange Money',
  vodacom_mpesa: 'Vodacom M-Pesa',
  stripe_card: 'carte bancaire',
  card: 'carte bancaire',
  cod: 'paiement à la livraison',
  wallet: 'portefeuille',
};

/**
 * A payment method in French. Takes the id ("airtel_money") or the English name the server writes now
 * ("Airtel Money", "Cash on delivery"), in any case: notices stored before the names were used still carry the id.
 */
export function methodFr(m: string): string {
  const id = paymentMethodId(m);
  return (id && METHODS_FR[id]) || m.replace(/_/g, ' ');
}

const NBSP = '\u00A0';

/**
 * A dollar amount the way French writes money: comma decimals, a non-breaking space between thousands, and one
 * before the sign ("52.00" -> "52,00 $", "1234567.5" -> "1 234 567,5 $"). The server writes English amounts with
 * a dot and no grouping; anything that is not a plain number is kept as received.
 */
export function moneyFr(amount: string | number): string {
  const raw = typeof amount === 'number' ? amount.toFixed(2) : String(amount).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return `${raw}${NBSP}$`;
  const whole = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${whole}${m[2] !== undefined ? `,${m[2]}` : ''}${NBSP}$`;
}

const ORDER_STATUSES: Record<string, string> = {
  pending: 'en attente',
  confirmed: 'confirmée',
  processing: 'en préparation',
  shipped: 'expédiée',
  out_for_delivery: 'en cours de livraison',
  delivered: 'livrée',
  cancelled: 'annulée',
  returned: 'retournée',
};
const orderStatusFr = (s: string): string => ORDER_STATUSES[s.replace(/ /g, '_')] ?? s;

const PAYMENT_STATUSES: Record<string, string> = {
  pending: 'en attente',
  succeeded: 'réussi',
  failed: 'échoué',
  refunded: 'remboursé',
};

/** Exchange and replacement steps (both are masculine: "Échange approuvé", "Remplacement expédié"). */
const AFTER_SALE_STEPS: Record<string, string> = {
  requested: 'demandé',
  approved: 'approuvé',
  rejected: 'refusé',
  completed: 'terminé',
  received: 'reçu',
  ready: 'prêt',
  allocated: 'attribué',
  dispatched: 'expédié',
};

/** Campaign states; "live" is the wording of the "campaign started" notice. */
const CAMPAIGN_STATUSES: Record<string, string> = {
  draft: 'en brouillon',
  pending: 'en attente',
  scheduled: 'programmée',
  active: 'active',
  ended: 'terminée',
  rejected: 'refusée',
  live: 'en ligne',
};

const STORE_STATUSES: Record<string, string> = {
  pending: 'en attente',
  approved: 'approuvée',
  rejected: 'refusée',
  suspended: 'suspendue',
};

const PRODUCT_STATUSES: Record<string, string> = {
  live: 'en ligne',
  draft: 'en brouillon',
  pending: 'en attente',
  rejected: 'refusé',
  removed: 'retiré',
};

const pick = (table: Record<string, string>, key: string): string => table[key] ?? key;

/** "2026-11-24" → "24/11/2026"; anything else as is. */
function dateFr(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

const REASONS: Record<string, string> = {
  // Failed payments (mobile-money network, finance, the customer)
  'payment was not completed': 'le paiement n’a pas abouti',
  'Payment was not approved.': 'Le paiement n’a pas été validé.',
  'Declined by subscriber.': 'Refusé par l’abonné.',
  'Declined by finance.': 'Refusé par la comptabilité.',
  'Timed out waiting for approval.': 'Délai de validation dépassé.',
  'Cancelled by customer.': 'Annulé par le client.',
  'Insufficient wallet balance.': 'Solde du portefeuille insuffisant.',
  'Could not reach the mobile-money network. Please try again.': 'Impossible de joindre le réseau mobile money. Veuillez réessayer.',
  'the transfer failed': 'le transfert a échoué',
  // Why a rider could not deliver (the rider app's choices, and the server default)
  'Customer not reachable': 'Client injoignable',
  'Customer unreachable': 'Client injoignable',
  'Wrong address': 'Adresse incorrecte',
  'Customer refused': 'Le client a refusé',
  'Payment issue': 'Problème de paiement',
  Other: 'Autre',
  Refunded: 'Remboursé',
  'Order cancelled': 'Commande annulée',
};

/** Reasons the server attaches to a failed payment or delivery. */
export function translateReason(r: string): string {
  const exact = REASONS[r];
  if (exact !== undefined) return exact;
  const network = /^The mobile-money network refused the payment: ([\s\S]+)$/.exec(r);
  if (network) return `Le réseau mobile money a refusé le paiement : ${network[1]}`;
  const other = /^Other: ([\s\S]+)$/.exec(r);
  if (other) return `Autre : ${other[1]}`;
  return r;
}

/** The default resolutions an admin gets when no note is typed. */
const RESOLUTIONS: Record<string, string> = {
  'Refunded to wallet': 'Remboursé sur le portefeuille',
  Resolved: 'Résolu',
  Rejected: 'Refusé',
};

// ── Titles ───────────────────────────────────────────────────────────────

const TITLES: Record<string, string> = {
  // The customer app's own list
  'Approve your payment': 'Validez votre paiement',
  'Order placed': 'Commande enregistrée',
  'Order cancelled': 'Commande annulée',
  'Order update': 'Mise à jour de la commande',
  'Rider assigned': 'Livreur assigné',
  'Parcel at our warehouse': 'Colis à notre entrepôt',
  'Delivery update': 'Suivi de la livraison',
  'Delivery attempt failed': 'Échec de la livraison',
  Payment: 'Paiement',
  'Payment received': 'Paiement reçu',
  'Payment failed': 'Paiement échoué',
  'Refund issued': 'Remboursement effectué',
  'Refund sent': 'Remboursement envoyé',
  'Return requested': 'Retour demandé',
  'Return received': 'Retour reçu',
  'Dispute opened': 'Litige ouvert',
  'Dispute resolved': 'Litige résolu',
  'Dispute closed': 'Litige clôturé',
  'Exchange requested': 'Échange demandé',
  'Replacement requested': 'Remplacement demandé',
  // Orders and deliveries
  'New order': 'Nouvelle commande',
  'New delivery available': 'Nouvelle livraison disponible',
  'New delivery assigned to you': 'Nouvelle livraison qui vous est assignée',
  'Parcel ready for pickup': 'Colis prêt pour l’enlèvement',
  'Seller package ready': 'Colis vendeur prêt',
  'Item cancelled by the seller': 'Article annulé par le vendeur',
  'Seller cancelled items': 'Articles annulés par le vendeur',
  // Returns, disputes, exchanges, replacements
  'Return requested on your order': 'Retour demandé sur votre commande',
  'Dispute opened on your order': 'Litige ouvert sur votre commande',
  'Returned goods received': 'Articles retournés reçus',
  'Return resolved': 'Retour résolu',
  'Return closed': 'Retour clôturé',
  'Exchange requested on your item': 'Échange demandé sur votre article',
  'Replacement requested on your item': 'Remplacement demandé sur votre article',
  // Payments and payouts
  'Payment amount mismatch': 'Écart de montant du paiement',
  'Phone refund failed': 'Échec du remboursement mobile',
  'Payout requested': 'Versement demandé',
  'Payout paid': 'Versement effectué',
  'Payout on its way': 'Versement en cours',
  'pawaPay payout failed': 'Échec du versement pawaPay',
  'Payout rejected': 'Versement refusé',
  // Support, reviews
  'New support ticket': 'Nouveau ticket d’assistance',
  'Support reply': 'Réponse de l’assistance',
  'The seller replied to your review': 'Le vendeur a répondu à votre avis',
  // Sellers, products, campaigns
  'Plan activated': 'Abonnement activé',
  'New seller application': 'Nouvelle candidature vendeur',
  'Seller resubmitted': 'Candidature vendeur renvoyée',
  'Product awaiting review': 'Produit en attente de modération',
  'Changes under review': 'Modifications en cours d’examen',
  'Product approved': 'Produit approuvé',
  'Product rejected': 'Produit refusé',
  'Product updated': 'Produit mis à jour',
  'Campaign withdrawn': 'Campagne retirée',
  'New campaign request': 'Nouvelle demande de campagne',
  'Campaign ended': 'Campagne terminée',
  'Campaign started': 'Campagne démarrée',
  // Settings → "Send a test push"
  'Test notification': 'Notification de test',
};

function titlePattern(title: string): string | null {
  const after = /^(Exchange|Replacement) (\w+)$/.exec(title);
  if (after) return `${after[1] === 'Exchange' ? 'Échange' : 'Remplacement'} ${pick(AFTER_SALE_STEPS, after[2])}`;
  const campaign = /^Campaign (\w+)$/.exec(title);
  if (campaign) return `Campagne ${pick(CAMPAIGN_STATUSES, campaign[1])}`;
  const store = /^Store (\w+)$/.exec(title);
  if (store) return `Boutique ${pick(STORE_STATUSES, store[1])}`;
  const batch = /^(\d+) deliveries assigned to you$/.exec(title);
  if (batch) return `${batch[1]} livraisons qui vous sont assignées`;
  return null;
}

// ── Bodies (first match wins: keep the specific patterns above the general ones) ──

const BODIES: Rule[] = [
  // Orders and deliveries
  [/^(\S+) reached the Somba&Teka warehouse and will be on its way soon\.$/, (m) => `${m[1]} est arrivé à l’entrepôt Somba&Teka et sera bientôt en route.`],
  [/^Approve the (.+) request on your phone to confirm (\S+)\.$/, (m) => `Validez la demande ${methodFr(m[1])} sur votre téléphone pour confirmer ${m[2]}.`],
  [/^We received (\S+)\. You'll get updates here in real time\.$/, (m) => `Nous avons reçu ${m[1]}. Vous recevrez les mises à jour ici en temps réel.`],
  [/^(\S+) is now in your deliveries\.$/, (m) => `${m[1]} est maintenant dans vos livraisons.`],
  [/^(\S+) is packed and ready\.$/, (m) => `${m[1]} : colis emballé et prêt.`],
  [
    /^(\S+): one seller's package is ready, waiting for (\d+) more sellers?\.$/,
    (m) => `${m[1]} : le colis d’un vendeur est prêt, en attente de ${m[2]} ${Number(m[2]) > 1 ? 'autres vendeurs' : 'autre vendeur'}.`,
  ],
  [
    /^(\S+)( · collect \$([\d.]+) cash)?\. Open the app to accept it\.$/,
    (m) => `${m[1]}${m[2] !== undefined ? ` · à encaisser : ${moneyFr(m[3])} en espèces` : ''}. Ouvrez l’application pour l’accepter.`,
  ],
  [/^(.+) — collect them at the warehouse\.$/, (m) => `${m[1]} — à récupérer à l’entrepôt.`],
  [/^(\S+) · \$([\d.]+) from (.+)$/, (m) => `${m[1]} · ${moneyFr(m[2])} de ${m[3]}`],
  [/^(\S+): (\d+) item\(s\) to pack — \$([\d.]+)$/, (m) => `${m[1]} : ${m[2]} article(s) à préparer — ${moneyFr(m[3])}`],
  [
    /^(\S+): (.+) was cancelled \((.+)\)\.( \$([\d.]+) was refunded to your wallet\.)? The rest of your order continues\.$/,
    (m) =>
      `${m[1]} : ${m[2]} a été annulé (${translateReason(m[3])}).${m[4] !== undefined ? ` ${moneyFr(m[5])} ont été remboursés sur votre portefeuille.` : ''} Le reste de votre commande continue.`,
  ],

  // Quoted names first: the general "X is now Y." rule below would swallow a one-word name
  [/^"(.+)" reached its end date; prices are back to normal\.$/, (m) => `« ${m[1]} » a atteint sa date de fin ; les prix sont revenus à la normale.`],
  [/^"(.+)" is now (\w+)\.$/, (m) => `« ${m[1]} » est maintenant ${pick(CAMPAIGN_STATUSES, m[2])}.`],
  [/^(.+) withdrew "(.+)"\.$/, (m) => `${m[1] === 'A seller' ? 'Un vendeur' : m[1]} a retiré « ${m[2]} ».`],
  [/^(.+) · (\d+(?:\.\d+)?)% off$/, (m) => `${m[1]} · ${m[2]} % de réduction`],
  [
    /^Your store "(.+)" is now (\w+)\.(?: Reason: ([\s\S]+))?$/,
    (m) => `Votre boutique « ${m[1]} » est maintenant ${pick(STORE_STATUSES, m[2])}.${m[3] !== undefined ? ` Motif : ${m[3]}` : ''}`,
  ],
  [/^Your (.+) plan is active until (\S+)\.$/, (m) => `Votre abonnement ${m[1]} est actif jusqu’au ${dateFr(m[2])}.`],
  [/^Your changes to (.+) are being reviewed$/, (m) => `Vos modifications de ${m[1]} sont en cours d’examen.`],
  [/^(.+) from (.+) needs moderation\.$/, (m) => `${m[1]} de ${m[2] === 'a seller' ? 'un vendeur' : m[2]} doit être modéré.`],
  [
    /^(.+) was edited by (.+) and needs moderation again\.$/,
    (m) => `${m[1]} a été modifié par ${m[2] === 'a seller' ? 'un vendeur' : m[2]} et doit être modéré à nouveau.`,
  ],
  [/^(.+) is now (live|rejected|draft|removed)\.$/, (m) => `${m[1]} est maintenant ${pick(PRODUCT_STATUSES, m[2])}.`],

  // Order status ("SOM-12345 is now out for delivery.")
  [/^(\S+) is now (.+)\.$/, (m) => `${m[1]} est maintenant ${orderStatusFr(m[2])}.`],

  // Cancellations and failed deliveries
  [/^(\S+) was cancelled\. Refund credited to your wallet\.$/, (m) => `${m[1]} a été annulée. Le remboursement a été crédité sur votre portefeuille.`],
  [/^(\S+) was cancelled\. \$([\d.]+) was refunded to your wallet\.$/, (m) => `${m[1]} a été annulée. ${moneyFr(m[2])} ont été remboursés sur votre portefeuille.`],
  [/^(\S+) was cancelled\.$/, (m) => `${m[1]} a été annulée.`],
  [/^(\S+) was cancelled: (.+)\.$/, (m) => `${m[1]} a été annulée : ${translateReason(m[2])}.`],
  [
    /^(\S+) was cancelled by Somba&Teka support: (.+?)\.( \$([\d.]+) was refunded to your wallet\.)?$/,
    (m) =>
      `${m[1]} a été annulée par l’assistance Somba&Teka : ${translateReason(m[2])}.${m[3] !== undefined ? ` ${moneyFr(m[4])} ont été remboursés sur votre portefeuille.` : ''}`,
  ],
  [
    /^(\S+) was cancelled( \((.+)\)| by Somba&Teka| by the customer)\. Do not pack it\.$/,
    (m) => {
      const who = m[3] !== undefined ? ` (${translateReason(m[3])})` : m[2] === ' by Somba&Teka' ? ' par Somba&Teka' : ' par le client';
      return `${m[1]} a été annulée${who}. Ne la préparez pas.`;
    },
  ],
  [/^(.+) is handling (\S+)\.$/, (m) => `${m[1]} s’occupe de ${m[2]}.`],
  [
    /^(\S+): (.+)\. We will try again \(attempt (\d+) of (\d+)\)\. You can also cancel the order\.$/,
    (m) => `${m[1]} : ${translateReason(m[2])}. Nous allons réessayer (tentative ${m[3]} sur ${m[4]}). Vous pouvez aussi annuler la commande.`,
  ],
  [
    /^(\S+) could not be delivered after (\d+) attempts \((.+)\)\. \$([\d.]+) was refunded to your wallet\.$/,
    (m) => `${m[1]} n’a pas pu être livrée après ${m[2]} tentatives (${translateReason(m[3])}). ${moneyFr(m[4])} ont été remboursés sur votre portefeuille.`,
  ],
  [
    /^(\S+) could not be delivered after (\d+) attempts \((.+)\)\.( Your payment was refunded to your wallet\.)?$/,
    (m) => `${m[1]} n’a pas pu être livrée après ${m[2]} tentatives (${translateReason(m[3])}).${m[4] !== undefined ? ' Votre paiement a été remboursé sur votre portefeuille.' : ''}`,
  ],

  // Payments and refunds
  [/^\$([\d.]+) added to your wallet\.$/, (m) => `${moneyFr(m[1])} ajoutés à votre portefeuille.`],
  [/^Payment for (\S+) confirmed\.$/, (m) => `Le paiement de ${m[1]} est confirmé.`],
  [/^Payment for your (.*) seller plan confirmed\.$/, (m) => `Le paiement de votre abonnement vendeur ${m[1]} est confirmé.`],
  [/^\$([\d.]+) for (\S+)( → wallet)?\.$/, (m) => `${moneyFr(m[1])} pour ${m[2]}${m[3] !== undefined ? ' → portefeuille' : ''}.`],
  [/^\$([\d.]+) for (\S+) is on its way back to your mobile-money number\.$/, (m) => `${moneyFr(m[1])} pour ${m[2]} reviennent sur votre numéro mobile money.`],
  [/^\$([\d.]+) for (\S+) was sent to your mobile-money number\.$/, (m) => `${moneyFr(m[1])} pour ${m[2]} ont été envoyés sur votre numéro mobile money.`],
  [
    /^\$([\d.]+) for (\S+) → wallet \(the network could not take it back to your phone\)\.$/,
    (m) => `${moneyFr(m[1])} pour ${m[2]} → portefeuille (le réseau n’a pas pu les renvoyer sur votre téléphone).`,
  ],
  [/^(\S+) · (.+?) · \$([\d.]+) · (\w+)$/, (m) => `${m[1]} · ${methodFr(m[2])} · ${moneyFr(m[3])} · ${pick(PAYMENT_STATUSES, m[4])}`],
  [
    /^(\S+): provider reported \$([\d.]+), expected \$([\d.]+)\. Review manually\.$/,
    (m) => `${m[1]} : le prestataire a indiqué ${moneyFr(m[2])}, ${moneyFr(m[3])} attendus. À vérifier manuellement.`,
  ],
  [
    /^(\S+): pawaPay could not refund \$([\d.]+)(?: \((.+)\))?\. It was credited to the customer's wallet\.$/,
    (m) => `${m[1]} : pawaPay n’a pas pu rembourser ${moneyFr(m[2])}${m[3] !== undefined ? ` (${m[3]})` : ''}. Le montant a été crédité sur le portefeuille du client.`,
  ],

  // Payouts
  [/^(\S+) · \$([\d.]+) credited to your wallet\.$/, (m) => `${m[1]} · ${moneyFr(m[2])} crédités sur votre portefeuille.`],
  [
    /^(\S+) · \$([\d.]+) sent to your (bank account|mobile-money number) \(ref (.+)\)\.$/,
    (m) => `${m[1]} · ${moneyFr(m[2])} envoyés sur votre ${m[3] === 'bank account' ? 'compte bancaire' : 'numéro mobile money'} (réf. ${m[4]}).`,
  ],
  [
    /^(\S+) · \$([\d.]+) sent to your mobile-money number(?: \(receipt (.+)\))?\.$/,
    (m) => `${m[1]} · ${moneyFr(m[2])} envoyés sur votre numéro mobile money${m[3] !== undefined ? ` (reçu ${m[3]})` : ''}.`,
  ],
  [/^(\S+) · \$([\d.]+) is being sent to your mobile-money number\.$/, (m) => `${m[1]} · ${moneyFr(m[2])} en cours d’envoi sur votre numéro mobile money.`],
  [
    /^(\S+) · (.+): (.+)\. It is back in the queue\.$/,
    (m) => `${m[1]} · ${m[2]} : ${translateReason(m[3])}. Il est de nouveau dans la file d’attente.`,
  ],

  // Returns, disputes, support, reviews
  [/^(\S+): we received your goods\. Your request is being reviewed\.$/, (m) => `${m[1]} : nous avons reçu vos articles. Votre demande est en cours d’examen.`],
  [
    /^(\S+) · (\S+): the warehouse received the returned goods\.$/,
    (m) => `${m[1]} · ${m[2]} : l’entrepôt a reçu les articles retournés.`,
  ],
  [/^(\S+)( · \S+)?: (Refunded to wallet|Resolved|Rejected)$/, (m) => `${m[1]}${m[2] ?? ''} : ${pick(RESOLUTIONS, m[3])}`],
  [/^Your review: ([\s\S]*)$/, (m) => `Votre avis : ${m[1]}`],

  // Settings → "Send a test push"
  [
    /^Notifications reach this account\. If push is set up, your devices show this too\.$/,
    () => 'Les notifications arrivent bien sur ce compte. Si les notifications push sont configurées, vos appareils affichent aussi celle-ci.',
  ],
];

/**
 * The French title and body of a server notice, or null when `locale` is not French or nothing in it is known.
 * A half match (known title, free-text body) keeps the unknown half as received.
 */
export function localizeNotice(title: string, body: string, locale: string | null | undefined): NoticeText | null {
  if (locale !== 'fr') return null;
  const t = TITLES[title] ?? titlePattern(title);
  let b: string | null = null;
  for (const [re, build] of BODIES) {
    const m = re.exec(body);
    if (m) {
      b = build(m);
      break;
    }
  }
  if (b === null && title === 'Payment failed') {
    // The reason ("Payment was not approved.") is the whole body of a failed-payment notice.
    const reason = translateReason(body);
    if (reason !== body) b = reason;
  }
  if (t === null && b === null) return null;
  return { title: t ?? title, body: b ?? body };
}

/**
 * The French text of a stored notice: what its sender authored (`titleFr` / `bodyFr`), else the built-in
 * translation, else null.
 */
export function frenchNotice(n: { title: string; body: string; titleFr?: string | null; bodyFr?: string | null }): NoticeText | null {
  const built = localizeNotice(n.title, n.body, 'fr');
  if (!n.titleFr && !n.bodyFr) return built;
  return { title: n.titleFr || built?.title || n.title, body: n.bodyFr || built?.body || n.body };
}

// ── Wallet history lines ─────────────────────────────────────────────────

const WALLET_LINES: Rule[] = [
  [/^Order (\S+)$/, (m) => `Commande ${m[1]}`],
  [/^Wallet top-up via (.+)$/, (m) => `Recharge du portefeuille via ${methodFr(m[1])}`],
  [/^Refund for cancelled order (\S+)$/, (m) => `Remboursement de la commande annulée ${m[1]}`],
  [/^Refund for (\S+) \(phone refund failed\)$/, (m) => `Remboursement de ${m[1]} (échec du remboursement mobile)`],
  [/^Refund for (\S+)$/, (m) => `Remboursement de ${m[1]}`],
  [/^Refund: seller cancelled part of (\S+)$/, (m) => `Remboursement : le vendeur a annulé une partie de ${m[1]}`],
  [/^Payout (\S+)$/, (m) => `Versement ${m[1]}`],
  [/^Seller plan (\S+)$/, (m) => `Abonnement vendeur ${m[1]}`],
  [/^Welcome store credit$/, () => 'Crédit de bienvenue'],
];

/** A wallet history line ("Wallet top-up via airtel_money") in the user's language; unknown lines as received. */
export function localizeWalletDescription(text: string, locale: string | null | undefined): string {
  if (locale !== 'fr') return text;
  for (const [re, build] of WALLET_LINES) {
    const m = re.exec(text);
    if (m) return build(m);
  }
  return text;
}
