/**
 * The ONE fee line a customer sees: "Platform commission" / "Commission de la plateforme". It is the sum of every fee the
 * customer pays on top of the goods (today the delivery fee, whatever it is made of: distance, warehouse transfers, a lane
 * cost, an express surcharge). The customer never sees how it is made up; staff and admins keep the breakdown.
 *
 * Not to be confused with the SELLER commission (`order_items.commissionPct` / `commissionUsd`, and `categories.commissionPct`):
 * that is deducted from the seller's payout and is never charged to, or shown to, the customer.
 */
export function platformFeeUsd(...fees: (number | null | undefined)[]): number {
  const cents = fees.reduce<number>((t, f) => t + (Number.isFinite(Number(f)) ? Math.round(Number(f) * 100) : 0), 0);
  return cents / 100;
}
