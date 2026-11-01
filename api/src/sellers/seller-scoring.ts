import type { Seller } from '../database/entities';

export type Badge = Seller['badge'];

/** What a store needs for each badge. `somba_assured` is granted by hand and never touched here. */
export const BADGE_RULES = {
  gold: { minReviews: 20, minRating: 4.5, minFulfilment: 0.95 },
  silver: { minReviews: 5, minRating: 4.0, minFulfilment: 0.9 },
} as const;
/** Settled order lines needed before the fulfilment rate means anything. */
export const MIN_SETTLED_LINES = 5;

export interface Scores {
  rating: number;
  ratingCount: number;
  /** 0..1, null when fewer than {@link MIN_SETTLED_LINES} lines have settled. */
  fulfilmentRate: number | null;
}

/** Average of ratings rounded to one decimal; 0 when nobody reviewed the store. */
export function averageRating(ratings: number[]): number {
  if (!ratings.length) return 0;
  return Math.round((ratings.reduce((t, r) => t + r, 0) / ratings.length) * 10) / 10;
}

/** Share of settled lines the seller fulfilled (delivered) rather than cancelled; null when there is too little data. */
export function fulfilmentRateOf(settled: number, cancelledBySeller: number): number | null {
  if (settled < MIN_SETTLED_LINES) return null;
  return Math.round((1 - cancelledBySeller / settled) * 1000) / 1000;
}

/**
 * The badge a store has earned. A store with no fulfilment data yet can reach silver on reviews alone but not gold
 * (gold promises reliability, which needs evidence).
 */
export function badgeFor(scores: Scores, current: Badge): Badge {
  if (current === 'somba_assured') return current;
  const { rating, ratingCount, fulfilmentRate } = scores;
  const g = BADGE_RULES.gold;
  if (ratingCount >= g.minReviews && rating >= g.minRating && fulfilmentRate !== null && fulfilmentRate >= g.minFulfilment) return 'gold';
  const s = BADGE_RULES.silver;
  if (ratingCount >= s.minReviews && rating >= s.minRating && (fulfilmentRate === null || fulfilmentRate >= s.minFulfilment)) return 'silver';
  return 'bronze';
}
