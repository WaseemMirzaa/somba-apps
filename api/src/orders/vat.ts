/**
 * VAT and who pays the delivery fee: the pure rules (no I/O), shared by order creation, refunds, the product views and
 * the contract doc (`docs/contracts/vat-and-fees.md`).
 *
 * VAT is ADDED on top of the item prices at checkout, per line, on what the line costs after its share of the promo
 * discount (coupons and flash / campaign prices come before VAT). Each order line keeps the rate it was placed with. VAT
 * belongs to the state, not to the seller: it never enters seller earnings, payouts or commission.
 */

export type FeePayer = 'customer' | 'seller';

export const DEFAULT_VAT_PCT = 16;
export const MAX_VAT_PCT = 50;

export const cents = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export interface VatConfig {
  /** `settings.vatEnabled`: off (the default) = no VAT is charged or shown. */
  enabled: boolean;
  /** `settings.vatPct`: the rate of every category that sets none. */
  defaultPct: number;
}

/** The two stored setting strings, read as a config (a missing or broken value falls back to "off" / 16). */
export function parseVatConfig(enabled: string | null | undefined, pct: string | null | undefined): VatConfig {
  const n = Number(pct);
  return { enabled: enabled === 'true', defaultPct: pct != null && String(pct).trim() !== '' && Number.isFinite(n) ? Math.min(MAX_VAT_PCT, Math.max(0, n)) : DEFAULT_VAT_PCT };
}

/** The rate a line is charged: 0 while VAT is off, else its category's rate (0 is a real rate), else the default. */
export function vatPctFor(cfg: VatConfig, categoryPct: number | null | undefined): number {
  if (!cfg.enabled) return 0;
  return typeof categoryPct === 'number' && Number.isFinite(categoryPct) ? Math.min(MAX_VAT_PCT, Math.max(0, categoryPct)) : cfg.defaultPct;
}

/** `deliveryFeePaidBy` as stored: anything but "seller" is "customer" (today's behaviour). */
export const feePayerOf = (v: string | null | undefined): FeePayer => (v === 'seller' ? 'seller' : 'customer');

/** VAT on an amount, in cents. */
export const vatOn = (taxableUsd: number, pct: number): number => (pct > 0 ? cents((Math.max(0, taxableUsd) * pct) / 100) : 0);

/**
 * Splits `totalUsd` across `weights` in whole cents (largest remainder), so the parts always add up to the total.
 * A zero or empty weight list gets nothing.
 */
export function allocate(totalUsd: number, weights: number[]): number[] {
  const total = Math.round(cents(totalUsd) * 100);
  const sum = weights.reduce((t, w) => t + Math.max(0, w), 0);
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) / sum) * total);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let left = total - floors.reduce((t, f) => t + f, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r + 1e-9) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors.map((c) => c / 100);
}

export interface PricedLine {
  priceUsd: number;
  qty: number;
}

/**
 * The money of an order's lines: each line's share of the promo discount (`lineDiscounts` when a store coupon named them,
 * else the order's `discountUsd` spread over the lines by value), its VAT, and, when the seller pays the delivery fee, its
 * share of the fee (by value). Every figure is in whole cents and adds up to the order's.
 */
export function orderLineMoney(input: {
  lines: PricedLine[];
  discountUsd: number;
  lineDiscounts?: number[] | null;
  vatPcts: number[];
  feeUsd: number;
  feePaidBy: FeePayer;
}): { discountUsd: number[]; vatUsd: number[]; feeUsd: number[]; vatTotalUsd: number } {
  const values = input.lines.map((l) => cents(l.priceUsd * l.qty));
  const discounts = input.lineDiscounts && input.lineDiscounts.length === values.length ? input.lineDiscounts.map(cents) : allocate(input.discountUsd, values);
  const vatUsd = values.map((v, i) => vatOn(v - (discounts[i] ?? 0), input.vatPcts[i] ?? 0));
  const feeUsd = input.feePaidBy === 'seller' ? allocate(input.feeUsd, values) : values.map(() => 0);
  return { discountUsd: discounts, vatUsd, feeUsd, vatTotalUsd: cents(vatUsd.reduce((t, v) => t + v, 0)) };
}

/** The VAT a part of a line carries: the line's stored VAT times the part's share of the line (a whole line carries all of it). */
export function vatShareUsd(line: { priceUsd: number; qty: number; vatUsd?: number | null }, partValueUsd: number): number {
  const vat = Number(line.vatUsd) || 0;
  const value = (Number(line.priceUsd) || 0) * (Number(line.qty) || 0);
  if (!(vat > 0) || !(value > 0)) return 0;
  return cents(vat * Math.min(1, Math.max(0, partValueUsd / value)));
}
