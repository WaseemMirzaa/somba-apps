/**
 * VAT and the delivery fee on a cart: the same arithmetic the server runs when it places an order (api/src/orders/vat.ts),
 * so the cart, checkout and payment pages show the total the order will charge. The order stays authoritative.
 *
 * VAT is ADDED on top of the item prices, per line, on what the line costs after its share of the promo discount. The
 * customer sees ONE summed "VAT" / "TVA" line. When the seller pays the delivery fee the customer pays none; when the
 * admin hides the fee line it is folded into the total ("incl. delivery").
 */

export interface VatRules {
  /** `settings.vatEnabled`: off = no VAT is charged or shown. */
  vatEnabled: boolean;
  /** `settings.deliveryFeePaidBy === "seller"`. */
  feePaidBySeller: boolean;
  /** `settings.showPlatformFee`: false = the fee is part of the total, not its own line. */
  showPlatformFee: boolean;
}

export const DEFAULT_VAT_RULES: VatRules = { vatEnabled: false, feePaidBySeller: false, showPlatformFee: true };

export interface VatLine {
  priceUsd: number;
  qty: number;
  /** The product's VAT % as the server serves it (0 while VAT is off, the category's rate, else the default). */
  vatPct?: number | null;
  /** The line takes part in the discount (a store coupon only discounts that store's lines). Default: yes. */
  discountable?: boolean;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  /** The one VAT line (0 = hide it). */
  vat: number;
  /** What the customer pays for delivery: 0 when the seller pays it. */
  fee: number;
  /** Show the fee as its own row (a fee of 0 is shown as "free" by the page). */
  showFeeLine: boolean;
  /** The fee is charged but folded into the total: the page writes "incl. delivery" next to Total. */
  feeInTotal: boolean;
  /** The seller pays the delivery fee: the page shows no fee row at all. */
  feePaidBySeller: boolean;
  total: number;
}

export const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Splits `total` over `weights` in whole cents, largest remainder first (the same rule as the server's `allocate`). */
export function allocate(total: number, weights: number[]): number[] {
  const t = Math.round(cents(total) * 100);
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (!(t > 0) || !(sum > 0)) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) / sum) * t);
  const parts = raw.map((r) => Math.floor(r + 1e-9));
  let left = t - parts.reduce((a, p) => a + p, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r + 1e-9) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      parts[i] += 1;
      left -= 1;
    }
  }
  return parts.map((p) => p / 100);
}

/** The VAT of each line, in cents, on its value less its share of the discount. */
export function lineVats(lines: VatLine[], discountUsd: number, rules: Pick<VatRules, "vatEnabled">): number[] {
  const values = lines.map((l) => cents(l.priceUsd * l.qty));
  const discounts = allocate(discountUsd, values.map((v, i) => (lines[i].discountable === false ? 0 : v)));
  return values.map((v, i) => {
    const pct = rules.vatEnabled ? Math.max(0, Number(lines[i].vatPct) || 0) : 0;
    return pct > 0 ? cents((Math.max(0, v - discounts[i]) * pct) / 100) : 0;
  });
}

/** The totals of a cart / an order being placed. `feeUsd` is the fee the quote shows (0 already when the seller pays). */
export function cartTotals(input: { lines: VatLine[]; discountUsd: number; feeUsd: number; rules?: Partial<VatRules> }): CartTotals {
  const rules = { ...DEFAULT_VAT_RULES, ...input.rules };
  const subtotal = cents(input.lines.reduce((t, l) => t + l.priceUsd * l.qty, 0));
  const discount = Math.min(cents(Math.max(0, input.discountUsd)), subtotal);
  const vat = cents(lineVats(input.lines, discount, rules).reduce((t, v) => t + v, 0));
  const fee = rules.feePaidBySeller ? 0 : cents(Math.max(0, input.feeUsd));
  return {
    subtotal,
    discount,
    vat,
    fee,
    showFeeLine: !rules.feePaidBySeller && rules.showPlatformFee,
    feeInTotal: !rules.feePaidBySeller && !rules.showPlatformFee && fee > 0,
    feePaidBySeller: rules.feePaidBySeller,
    total: cents(Math.max(0, subtotal - discount) + vat + fee),
  };
}

/** The label of the one VAT row. */
export const vatLabel = (fr: boolean): string => (fr ? "TVA" : "VAT");

/** The note next to "Total" when the fee is folded into it. */
export const inclDeliveryNote = (fr: boolean): string => (fr ? "livraison incluse" : "incl. delivery");

/** The rules, from the public settings (the server sends them as strings). */
export function vatRulesOf(raw: Partial<Record<string, string | boolean | number>> | null | undefined): VatRules {
  const on = (v: unknown) => v === true || v === "true";
  return {
    vatEnabled: on(raw?.vatEnabled),
    feePaidBySeller: raw?.deliveryFeePaidBy === "seller" || raw?.feePaidBySeller === true,
    showPlatformFee: raw?.showPlatformFee === undefined ? true : raw.showPlatformFee !== "false" && raw.showPlatformFee !== false,
  };
}
