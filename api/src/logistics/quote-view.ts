import { platformFeeUsd } from '../orders/platform-fee';

/** Who may see how a delivery fee is made up: the admin roles and warehouse staff. Everyone else, guests included, sees one line. */
export const seesFeeBreakdown = (role: string | undefined | null): boolean => !!role && (role.startsWith('admin') || role === 'warehouse_staff');

/** What a customer must not learn from a quote: how the fee is built (distance part, transfer, lane prices, flat override, kilometres). */
const BREAKDOWN_KEYS = ['deliveryUsd', 'transferUsd', 'defaultTransferUsd', 'distanceKm', 'feeOverrideUsd'] as const;

type Hop = { costUsd?: number; laneCost?: boolean } & Record<string, unknown>;
type Origin = { hops?: Hop[] } & Record<string, unknown>;

/**
 * The `delivery:quote` answer for this caller. `platformFeeUsd` (the sum of every fee the customer pays) is on every
 * answer; `feeUsd` stays as the same total for app builds that predate it. Staff and admins keep the full breakdown;
 * customers, guests and sellers get none of it (no hop prices, transfer, lane cost, distance or override), only the route,
 * the estimate and the date.
 */
export function quoteFor<T extends { feeUsd: number; origins?: Origin[] }>(quote: T, role: string | undefined | null): T & { platformFeeUsd: number } {
  const out: Record<string, unknown> = { ...quote, platformFeeUsd: platformFeeUsd(quote.feeUsd) };
  if (seesFeeBreakdown(role)) return out as T & { platformFeeUsd: number };
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
  return out as T & { platformFeeUsd: number };
}
