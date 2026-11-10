import { PREP_DAYS, estimateFromParts, localDay, partDays, routeDaysFor } from '../common/delivery/estimate';
import type { EstimatePart } from '../common/delivery/estimate';
import type { Route } from './routing.service';

/** One order line as the estimate sees it: its seller (a store id, a seller user id, or null) and that product's preparation. */
export interface EstimateLine {
  sellerId: string | null;
  prepDays: number;
  /** The store's handling days (0 when none). */
  handlingDays: number;
}

/** One seller's numbers. `prepDays` = the slowest product's preparation + the store's handling: the days until the parcel is handed over. */
export interface SellerEstimate {
  sellerId: string | null;
  prepDays: number;
  routeDays: number;
  estimateDays: number;
  estimatedDeliveryDate: string;
}

export interface OrderEstimate {
  deliveryMode: 'standard' | 'express';
  /** The deciding (slowest) seller's numbers; null without lines. */
  prepDays: number | null;
  routeDays: number | null;
  estimateDays: number | null;
  /** YYYY-MM-DD (Kinshasa): what `orders:create` stamps. */
  estimatedDeliveryDate: string | null;
  /** Per origin, in the order of `route.origins`. */
  sellers: SellerEstimate[];
  /** The legacy single number: what the order stamps (days from now), 3 for no lines. */
  days: number;
  date: string;
}

/**
 * The delivery estimate of an order: `min(30, max over sellers of (prep + handling + route))`, where a seller's route is the
 * platform's local days plus the days ITS parcels spend on lanes / between cities (or `expressDeliveryDays` for express).
 * Pure: the same function backs `delivery:quote` and `orders:create`, so the date the shopper sees is the date that is stamped.
 */
export function estimateOrder(route: Pick<Route, 'origins' | 'localDeliveryDays'> & Partial<Pick<Route, 'interCity'>>, lines: EstimateLine[], now = new Date()): OrderEstimate {
  const origins = route.origins ?? [];
  const bySeller = new Map<string | null, { prep: number; handling: number }>();
  for (const l of lines) {
    const key = l.sellerId ?? null;
    const cur = bySeller.get(key) ?? { prep: 0, handling: 0 };
    bySeller.set(key, { prep: Math.max(cur.prep, l.prepDays), handling: Math.max(cur.handling, l.handlingDays) });
  }
  const parts: (EstimatePart & { sellerId: string | null })[] = [];
  for (const [sellerId, v] of bySeller) {
    const origin = origins.find((o) => (o.sellerId ?? null) === sellerId);
    parts.push({ sellerId, prep: v.prep, handling: v.handling, route: routeDaysFor({ local: route.localDeliveryDays ?? 1, extraDays: origin?.extraDays ?? 0 }) });
  }
  const { days, date, deciding } = estimateFromParts(parts, now);
  const sellers = parts.map((p) => {
    const total = partDays(p);
    return { sellerId: p.sellerId, prepDays: p.prep + (p.handling ?? 0), routeDays: p.route, estimateDays: total, estimatedDeliveryDate: localDay(now, total) };
  });
  const d = deciding ? sellers[parts.indexOf(deciding as (typeof parts)[number])] : null;
  return {
    deliveryMode: 'standard',
    prepDays: d?.prepDays ?? null,
    routeDays: d?.routeDays ?? null,
    estimateDays: d?.estimateDays ?? null,
    estimatedDeliveryDate: d ? date : null,
    sellers,
    days,
    date,
  };
}

/** A line with no listing behind it (a client-priced demo line) uses the platform's default preparation time. */
export const DEFAULT_LINE_PREP = PREP_DAYS.fallback;
