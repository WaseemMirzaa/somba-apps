import type { Order, OrderItem } from '../database/entities';

/**
 * What the refunds on ONE order line take back from the seller (SL-01).
 *
 * `order_items.refundedUsd` is the money the customer got back for that line (a return of some units, an admin's
 * partial refund on a dispute, a seller cancelling the line). It is customer money: price x qty less the line's share
 * of the order's promo discount (`PartialRefundService.worth`, the seller-cancel refund), so the share of the line that
 * was refunded is `refundedUsd / paid`, where `paid` is that same customer-side value of the whole line. The seller
 * loses that share of what the line earned them (`lineGross`, after a store coupon) and the platform gives back the
 * same share of the commission stored on the line. Measuring against `priceUsd * qty` instead would leave the seller
 * the promo's share of every returned unit.
 *
 * Always computed from the running total on the line, never per refund event, so two partial refunds on the same line
 * are counted once each and a later full refund cannot count the first ones again.
 */

const round2 = (v: number) => Number(v.toFixed(2));
/** Half a cent: `refundedUsd` is stored rounded to cents. */
const HALF_CENT = 0.005;

type LineFields = Pick<OrderItem, 'priceUsd' | 'qty' | 'refundedUsd' | 'couponDiscountUsd' | 'commissionUsd'>;
type OrderFields = Pick<Order, 'subtotalUsd' | 'discountUsd'>;

/** What the customer paid for the line: price x qty less its pro-rata share of the order's promo discount. */
export function linePaidUsd(item: Pick<OrderItem, 'priceUsd' | 'qty'>, order: OrderFields | null | undefined): number {
  const value = (Number(item.priceUsd) || 0) * (Number(item.qty) || 0);
  const subtotal = Number(order?.subtotalUsd) || 0;
  const discount = Number(order?.discountUsd) || 0;
  if (!(subtotal > 0) || !(discount > 0)) return value;
  return Math.max(0, value - discount * (value / subtotal));
}

/** The share (0..1) of the line that was refunded. */
export function refundedFraction(item: Pick<OrderItem, 'priceUsd' | 'qty' | 'refundedUsd'>, order: OrderFields | null | undefined): number {
  const refunded = Number(item.refundedUsd) || 0;
  if (!(refunded > 0)) return 0;
  const paid = linePaidUsd(item, order);
  if (!(paid > 0) || refunded >= paid - HALF_CENT) return 1;
  return refunded / paid;
}

export interface LineRefund {
  /** Share of the line's gross (after store coupon) taken back. */
  grossUsd: number;
  /** Share of the stored commission the platform gives back. */
  commissionUsd: number;
  /** What the seller loses: grossUsd - commissionUsd. */
  netUsd: number;
  fraction: number;
}

/** What the refunds on the line take back from the seller, in cents (see the header). */
export function lineRefund(item: LineFields, order: OrderFields | null | undefined): LineRefund {
  const fraction = refundedFraction(item, order);
  if (fraction <= 0) return { grossUsd: 0, commissionUsd: 0, netUsd: 0, fraction: 0 };
  const gross = round2((Number(item.priceUsd) || 0) * (Number(item.qty) || 0) - (Number(item.couponDiscountUsd) || 0));
  const commission = round2(Number(item.commissionUsd) || 0);
  const grossUsd = fraction >= 1 ? gross : round2(gross * fraction);
  const commissionUsd = fraction >= 1 ? commission : round2(commission * fraction);
  return { grossUsd, commissionUsd, netUsd: round2(grossUsd - commissionUsd), fraction };
}

/**
 * The same share in SQL, for totals summed in the database. Needs the order line as `i` and its order as `o`. (Summed
 * unrounded, so a total can differ from the sum of rounded lines by a fraction of a cent per line.)
 */
const SQL_VALUE = '(i.priceUsd * i.qty)';
const SQL_PAID = `(CASE WHEN COALESCE(o.subtotalUsd, 0) > 0 AND COALESCE(o.discountUsd, 0) > 0 THEN ${SQL_VALUE} - o.discountUsd * ${SQL_VALUE} / o.subtotalUsd ELSE ${SQL_VALUE} END)`;
export const SQL_REFUNDED_FRACTION = `(CASE WHEN COALESCE(i.refundedUsd, 0) <= 0 THEN 0 WHEN ${SQL_PAID} <= 0 OR i.refundedUsd >= ${SQL_PAID} - ${HALF_CENT} THEN 1 ELSE i.refundedUsd / ${SQL_PAID} END)`;
/** 1 - the refunded share: multiply a line amount by it to keep only what was not refunded. */
export const SQL_KEPT_FRACTION = `(1 - ${SQL_REFUNDED_FRACTION})`;
