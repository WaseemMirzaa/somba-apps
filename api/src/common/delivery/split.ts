/**
 * Split delivery, pure rules (no I/O): what a leg's share of an order's money is, and when an order counts as partly delivered.
 */

export const cents2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The money a set of lines is worth to the customer: their value less their pro-rata share of the promo discount. The same
 * rule a seller's part-cancel refunds by, so a split leg's share and a refund of the same lines are the same figure.
 */
export function lineShareUsd(order: { subtotalUsd: number; discountUsd?: number | null }, valueUsd: number): number {
  const share = order.subtotalUsd > 0 ? valueUsd / order.subtotalUsd : 0;
  return cents2(valueUsd - (order.discountUsd ?? 0) * share);
}

/** Lines of an order as far as delivery goes. */
export interface DeliverableLine {
  fulfilment?: string | null;
  deliveredAt?: Date | string | null;
}

export const isLive = (l: DeliverableLine): boolean => l.fulfilment !== 'cancelled';

/** Has any live line reached the customer while others have not? (A fully delivered order is a different case: it is simply delivered.) */
export function isPartiallyDelivered(lines: readonly DeliverableLine[] | null | undefined): boolean {
  const live = (lines ?? []).filter(isLive);
  return live.some((l) => !!l.deliveredAt) && live.some((l) => !l.deliveredAt);
}

/** Has any line reached the customer? */
export const anyDelivered = (lines: readonly DeliverableLine[] | null | undefined): boolean => (lines ?? []).some((l) => isLive(l) && !!l.deliveredAt);

/** The sentence an order that is partly delivered answers to a cancel or a refund with. */
export const PART_DELIVERED = 'Part of this order was already delivered. Contact support to stop the rest.';
