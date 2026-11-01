import type { Locale } from '../common/locale';

/**
 * Words in the CSV files the server builds (orders, statements, transactions): column headings and the labels of
 * statuses, kinds and payment methods, in the language of whoever asked. The data cells that are names, references
 * and amounts are never translated, and the JSON API keeps its stable codes: this is only for the downloaded files.
 */
type Words = Record<string, string>;

const EN: Words = {
  // orders
  'h.order': 'Order', 'h.date': 'Date', 'h.status': 'Status', 'h.package': 'Package', 'h.customer': 'Customer', 'h.city': 'City',
  'h.payment': 'Payment', 'h.product': 'Product', 'h.option': 'Option', 'h.qty': 'Qty', 'h.unitPrice': 'Unit price USD',
  'h.coupon': 'Coupon USD', 'h.commission': 'Commission USD', 'h.net': 'Net USD',
  // statements / transactions
  'h.statement': 'Statement', 'h.kind': 'Kind', 'h.sales': 'Sales USD', 'h.commissionPct': 'Commission %', 'h.reference': 'Reference',
  'h.description': 'Description', 'h.amount': 'Amount USD',
  't.orders': 'Orders', 't.units': 'Units', 't.sales': 'Sales USD', 't.commission': 'Commission USD', 't.returns': 'Returns USD', 't.net': 'Net USD',
  't.paid': 'Payouts paid USD',
  // Kinds, statuses and payment methods are written as their codes in English (as the files always were): see FR.
};

const FR: Words = {
  'h.order': 'Commande', 'h.date': 'Date', 'h.status': 'Statut', 'h.package': 'Colis', 'h.customer': 'Client', 'h.city': 'Ville',
  'h.payment': 'Paiement', 'h.product': 'Produit', 'h.option': 'Option', 'h.qty': 'Qté', 'h.unitPrice': 'Prix unitaire USD',
  'h.coupon': 'Coupon USD', 'h.commission': 'Commission USD', 'h.net': 'Net USD',
  'h.statement': 'Relevé', 'h.kind': 'Type', 'h.sales': 'Ventes USD', 'h.commissionPct': 'Commission %', 'h.reference': 'Référence',
  'h.description': 'Description', 'h.amount': 'Montant USD',
  't.orders': 'Commandes', 't.units': 'Unités', 't.sales': 'Ventes USD', 't.commission': 'Commission USD', 't.returns': 'Retours USD', 't.net': 'Net USD',
  't.paid': 'Versements payés USD',
  'k.sale': 'vente', 'k.refund': 'remboursement', 'k.payout': 'versement',
  's.pending': 'en attente', 's.confirmed': 'confirmée', 's.processing': 'en préparation', 's.shipped': 'expédiée', 's.out_for_delivery': 'en cours de livraison',
  's.delivered': 'livrée', 's.cancelled': 'annulée', 's.returned': 'retournée',
  'p.to_pack': 'à emballer', 'p.ready': 'prêt', 'p.at_hub': 'à l’entrepôt',
  'o.requested': 'demandé', 'o.sending': 'en cours d’envoi', 'o.rejected': 'rejeté', 'o.paid': 'payé',
  'm.cod': 'Paiement à la livraison', 'm.card': 'Carte', 'm.stripe_card': 'Carte', 'm.wallet': 'Portefeuille',
};

export interface CsvWords {
  /** A heading or caption by key (`h.order`, `t.net`). */
  t(key: string): string;
  /** An order status (`delivered`), or the code itself when we have no word for it. */
  orderStatus(code: string): string;
  packageStatus(code: string): string;
  payoutStatus(code: string): string;
  kind(code: string): string;
  /** A payment method id or its display name. */
  method(idOrLabel: string | null | undefined): string;
}

export function csvWords(locale: Locale): CsvWords {
  const w = locale === 'fr' ? FR : EN;
  const pick = (prefix: string) => (code: string) => w[`${prefix}.${code}`] ?? code;
  return {
    t: (key) => w[key] ?? EN[key] ?? key,
    orderStatus: pick('s'),
    packageStatus: (code) => w[`p.${code}`] ?? w[`s.${code}`] ?? code,
    payoutStatus: pick('o'),
    kind: pick('k'),
    method: (id) => {
      const raw = String(id ?? '');
      return w[`m.${raw}`] ?? raw;
    },
  };
}
