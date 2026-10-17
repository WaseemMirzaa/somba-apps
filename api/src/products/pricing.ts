/**
 * Pure pricing rules shared by the storefront (what is shown) and checkout
 * (what is charged).
 *
 * STACKING RULE (documented for everyone):
 *  - Line-level promotions never stack: for each product the customer gets the
 *    LOWEST unit price among the listing price, the running flash-sale price and
 *    the best running seller-campaign price. On a tie the flash sale wins.
 *  - A promo CODE is a cart-level coupon: it applies on top of the resulting
 *    subtotal (and is capped at the subtotal, so a total can never go below zero).
 */
import type { CampaignStatus } from '../database/entities/campaign.entity';

export interface CampaignLike {
  id: string;
  name?: string | null;
  sellerId: string | null;
  discount: number;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  productIds?: string[] | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Window of a campaign in epoch ms. A date-only end date is inclusive (end of that UTC day). */
export function campaignWindow(c: Pick<CampaignLike, 'startDate' | 'endDate'>): { from: number | null; to: number | null } {
  const parse = (s: string | null, endOfDay: boolean): number | null => {
    if (!s) return null;
    const t = Date.parse(DATE_ONLY.test(s) ? `${s}T00:00:00.000Z` : s);
    if (!Number.isFinite(t)) return null;
    return DATE_ONLY.test(s) && endOfDay ? t + 86_400_000 - 1 : t;
  };
  return { from: parse(c.startDate, false), to: parse(c.endDate, true) };
}

/**
 * Is the campaign giving discounts right now?
 *  - 'active'    (approved by marketing): inside its dates; a missing bound means open-ended.
 *  - 'scheduled' (approved, waiting for its start): only once its start date has passed.
 *  - draft / pending / rejected / ended never discount.
 */
export function campaignRunning(c: CampaignLike, now = Date.now()): boolean {
  if (!(c.discount > 0)) return false;
  const { from, to } = campaignWindow(c);
  if (c.status === 'active') return !(from !== null && now < from) && !(to !== null && now > to);
  if (c.status === 'scheduled') return from !== null && now >= from && !(to !== null && now > to);
  return false;
}

/** Does this running campaign cover the product? An explicit product list wins; otherwise the whole store. */
export function campaignCovers(c: CampaignLike, product: { id: string; sellerId: string | null }): boolean {
  if (c.productIds && c.productIds.length) return c.productIds.includes(product.id);
  return !!c.sellerId && c.sellerId === product.sellerId;
}

export type PriceSource = 'base' | 'flash' | 'campaign';

const cents = (n: number) => Number(n.toFixed(2));

/** Lowest unit price among the base price, a flash price and a campaign percentage. */
export function bestPrice(
  base: number,
  flashPrice: number | undefined,
  campaignPct: number | undefined,
): { price: number; source: PriceSource; campaignPct: number } {
  let price = base;
  let source: PriceSource = 'base';
  if (flashPrice !== undefined && flashPrice > 0 && flashPrice < price) {
    price = flashPrice;
    source = 'flash';
  }
  if (campaignPct !== undefined && campaignPct > 0) {
    const cp = cents(base * (1 - Math.min(90, campaignPct) / 100));
    if (cp > 0 && cp < price) {
      price = cp;
      source = 'campaign';
    }
  }
  return { price: cents(price), source, campaignPct: source === 'campaign' ? Math.min(90, campaignPct ?? 0) : 0 };
}
