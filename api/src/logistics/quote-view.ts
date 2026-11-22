import { platformFeeUsd } from '../orders/platform-fee';

/** Who may see how a delivery fee is made up: the admin roles and warehouse staff. Everyone else, guests included, sees one line. */
export const seesFeeBreakdown = (role: string | undefined | null): boolean => !!role && (role.startsWith('admin') || role === 'warehouse_staff');

/** What a customer must not learn from a quote: how the fee is built (distance part, transfer, lane prices, flat override, kilometres). */
const BREAKDOWN_KEYS = ['deliveryUsd', 'transferUsd', 'defaultTransferUsd', 'distanceKm', 'feeOverrideUsd'] as const;

type Hop = { costUsd?: number; laneCost?: boolean } & Record<string, unknown>;
type Origin = { hops?: Hop[] } & Record<string, unknown>;

/**
 * The `delivery:quote` answer for this caller. `feePaidBySeller` / `showFee` carry the fee rules (see `settings.deliveryFeePaidBy` / `showPlatformFee`).
 * `platformFeeUsd` (the sum of every fee the customer pays) is on every
 * answer; `feeUsd` stays as the same total for app builds that predate it. Staff and admins keep the full breakdown;
 * customers, guests and sellers get none of it (no hop prices, transfer, lane cost, distance or override), only the route,
 * the estimate and the date.
 */
export function quoteFor<T extends { feeUsd: number; origins?: Origin[] }>(quote: T, role: string | undefined | null, rules: { feePaidBy?: 'customer' | 'seller'; showFee?: boolean } = {}): T & { platformFeeUsd: number; feePaidBySeller: boolean; showFee: boolean } {
  const sellerPays = rules.feePaidBy === 'seller';
  const out: Record<string, unknown> = { ...quote, platformFeeUsd: platformFeeUsd(quote.feeUsd), feePaidBySeller: sellerPays, showFee: !sellerPays && rules.showFee !== false };
  // The seller pays the fee: a shopper's quote carries none (the order will not charge it, so the cart adds up). Staff keep the real figure.
  if (sellerPays && !seesFeeBreakdown(role)) {
    out.feeUsd = 0;
    out.platformFeeUsd = 0;
  }
  if (seesFeeBreakdown(role)) return out as T & { platformFeeUsd: number; feePaidBySeller: boolean; showFee: boolean };
  for (const k of BREAKDOWN_KEYS) delete out[k];
  if (Array.isArray(quote.origins)) {
    out.origins = quote.origins.map((o) => ({
      ...o,
      hops: (o.hops ?? []).map((h) => {
        const { costUsd: _cost, laneCost: _lane, ...route } = h;
        return route;
      }),
    }));
  }
  return out as T & { platformFeeUsd: number; feePaidBySeller: boolean; showFee: boolean };
}
