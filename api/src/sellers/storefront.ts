import { BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import type { DataSource, Repository } from 'typeorm';
import { Product, Seller } from '../database/entities';
import { DELIVERY_DAYS, deliveryDaysOf } from '../common/delivery/estimate';

/** The longest handling time a store may promise (days). */
export const MAX_HANDLING_DAYS = 14;
/** Vacation can be planned at most this far ahead. */
export const MAX_VACATION_DAYS = 366;

type VacationFields = { vacationUntil?: Date | string | null };

/** Is the store on vacation right now (a return date in the future)? */
export function onVacation(seller: VacationFields | null | undefined, now = Date.now()): boolean {
  if (!seller?.vacationUntil) return false;
  const t = new Date(seller.vacationUntil).getTime();
  return Number.isFinite(t) && t > now;
}

/** "12 Nov 2026" / "12 nov. 2026". */
function day(d: Date, locale: 'en' | 'fr'): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** The message shoppers see (both languages) while a store is away. */
export function vacationNotice(storeName: string, until: Date | string): { en: string; fr: string } {
  const d = new Date(until);
  return {
    en: `${storeName} is on vacation until ${day(d, 'en')} and is not taking new orders.`,
    fr: `${storeName} est en vacances jusqu’au ${day(d, 'fr')} et ne prend pas de nouvelles commandes.`,
  };
}

/** One string for API errors (clients show the part in their language, or both): "EN / FR". */
export const vacationError = (storeName: string, until: Date | string): string => {
  const n = vacationNotice(storeName, until);
  return `${n.en} / ${n.fr}`;
};

/** Throws the bilingual message when the store is away (new orders and cart additions are paused; orders in flight carry on). */
export function assertStoreOpen(store: Pick<Seller, 'name' | 'vacationUntil'> | null | undefined, now = Date.now()): void {
  if (store && onVacation(store, now)) throw new BadRequestException(vacationError(store.name, store.vacationUntil as Date));
}

/** The store row behind a listing's `sellerId` (the store id, or the owner's user id on older demo data). */
export function storeForListing(repo: Repository<Seller>, sellerId: string): Promise<Seller | null> {
  return repo.findOne({ where: [{ id: sellerId }, { userId: sellerId }] });
}

/**
 * Delivery time of a listing as shoppers should see it: the seller's transit time plus the store's handling time, and
 * THE TOTAL never exceeds the platform maximum of 30 days (DELIVERY_DAYS.max): the order's estimated date is built from
 * the same number, so a product page and the order it becomes always agree.
 */
export function totalDeliveryDays(deliveryDays: unknown, store: Pick<Seller, 'handlingDays'> | null | undefined): number {
  const handling = Math.max(0, Math.min(MAX_HANDLING_DAYS, Math.floor(Number(store?.handlingDays) || 0)));
  return Math.min(DELIVERY_DAYS.max, deliveryDaysOf(deliveryDays) + handling);
}

/** Validate a handling time: whole days 0..14. */
export function cleanHandlingDays(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === null || v === '' || !Number.isInteger(n) || n < 0 || n > MAX_HANDLING_DAYS) {
    throw new BadRequestException(`Handling time must be a whole number of days from 0 to ${MAX_HANDLING_DAYS}.`);
  }
  return n;
}

/** Validate a return date: null / '' ends the vacation; otherwise a date in the future, at most a year ahead. */
export function cleanVacationUntil(v: unknown, now = Date.now()): Date | null {
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) throw new BadRequestException('Enter a valid return date, or clear it to reopen the store.');
  // A bare date ("2026-11-12") means the end of that day, so "back on the 12th" keeps the store closed through it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 0);
  if (d.getTime() <= now) throw new BadRequestException('Choose a return date in the future. To reopen now, clear the date.');
  if (d.getTime() > now + MAX_VACATION_DAYS * 86_400_000) throw new BadRequestException('A vacation can last at most one year.');
  return d;
}

/**
 * Cart additions of a store that is away are refused. Lines the cart already holds stay (the shopper can still remove
 * them, and an order for them is refused at checkout), so syncing an old cart never fails.
 */
export async function assertNoNewVacationLines(
  ds: DataSource,
  existingProductIds: Set<string>,
  lineProductIds: string[],
  now = Date.now(),
): Promise<void> {
  const fresh = [...new Set(lineProductIds.filter((id) => !existingProductIds.has(id)))];
  if (!fresh.length) return;
  const products = await ds.getRepository(Product).find({ where: { id: In(fresh) }, select: { id: true, sellerId: true } });
  const keys = [...new Set(products.map((p) => p.sellerId).filter((x): x is string => !!x))];
  if (!keys.length) return;
  const stores = await ds.getRepository(Seller).find({ where: [{ id: In(keys) }, { userId: In(keys) }] });
  for (const s of stores) assertStoreOpen(s, now);
}

// ── Goals ───────────────────────────────────────────────────────────────────

export interface SellerGoals {
  revenueUsd: number | null;
  orders: number | null;
  rating: number | null;
  products: number | null;
}
export const EMPTY_GOALS: SellerGoals = { revenueUsd: null, orders: null, rating: null, products: null };

export function parseGoals(raw: string | null | undefined): SellerGoals {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<SellerGoals>) : {};
    return cleanGoals({ ...EMPTY_GOALS, ...v }, true);
  } catch {
    return { ...EMPTY_GOALS };
  }
}

/** Validate goals sent by the seller; a blank / null value clears that goal. `lenient` = read what was stored without throwing. */
export function cleanGoals(input: unknown, lenient = false): SellerGoals {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const limits: Record<keyof SellerGoals, { max: number; int: boolean; label: string }> = {
    revenueUsd: { max: 1_000_000_000, int: false, label: 'Revenue goal' },
    orders: { max: 10_000_000, int: true, label: 'Orders goal' },
    rating: { max: 5, int: false, label: 'Rating goal' },
    products: { max: 1_000_000, int: true, label: 'Listings goal' },
  };
  const out = { ...EMPTY_GOALS };
  for (const k of Object.keys(limits) as (keyof SellerGoals)[]) {
    const v = src[k];
    if (v === undefined || v === null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    const { max, int, label } = limits[k];
    if (!Number.isFinite(n) || n < 0 || n > max || (int && !Number.isInteger(n))) {
      if (lenient) continue;
      throw new BadRequestException(`${label} must be ${int ? 'a whole number' : 'a number'} from 0 to ${max}.`);
    }
    out[k] = k === 'rating' || k === 'revenueUsd' ? Number(n.toFixed(2)) : n;
  }
  return out;
}
