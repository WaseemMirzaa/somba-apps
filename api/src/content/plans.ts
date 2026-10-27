import { num, str } from '../common/validate';

/**
 * Features a plan can switch on or off. A missing key means "allowed" (so plans saved before perks existed keep
 * working); `teamSeats` is the number of staff accounts besides the owner (missing / null = unlimited).
 */
export interface PlanPerks {
  /** Seller campaigns (store-wide or per product discounts). */
  promotions?: boolean;
  /** Nominating products for the platform's flash sales. */
  flashNomination?: boolean;
  /** The seller's own coupon codes. */
  coupons?: boolean;
  /** Bulk CSV import of listings. */
  bulkImport?: boolean;
  teamSeats?: number | null;
}
export const PERK_KEYS = ['promotions', 'flashNomination', 'coupons', 'bulkImport'] as const;
export type PerkKey = (typeof PERK_KEYS)[number];

/** A seller subscription plan, as configured in the `sellerPlans` setting. */
export interface SellerPlan {
  id: string;
  name: string;
  nameFr?: string;
  /** Price per period in USD. 0 = free plan. null = "contact sales" (cannot be bought online). */
  priceUsd: number | null;
  /** Length of one paid period in months. */
  months: number;
  /** Listing quota enforced by `products:create` while the plan is in force (omit / null = unlimited). */
  maxProducts?: number | null;
  /** What the plan unlocks. Enforced by the server (see `sellers/plan-gate.ts`); a plan without `perks` allows everything. */
  perks?: PlanPerks;
  /** Marketing bullet points shown on the plan card (informational: `maxProducts` and `perks` are what is enforced). */
  features: string[];
  featuresFr?: string[];
  popular?: boolean;
}

/** Defaults mirror the plans on the public "Sell online" page. */
export const DEFAULT_SELLER_PLANS: SellerPlan[] = [
  { id: 'free', name: 'Free', nameFr: 'Gratuit', priceUsd: 0, months: 1, perks: { promotions: true, flashNomination: false, coupons: false, bulkImport: false, teamSeats: 1 }, features: ['Order management', 'Email support'], featuresFr: ['Gestion des commandes', 'Support par e-mail'] },
  { id: 'starter', name: 'Starter', nameFr: 'Starter', priceUsd: 49, months: 1, perks: { promotions: true, flashNomination: false, coupons: true, bulkImport: true, teamSeats: 3 }, features: ['Order management', 'Basic analytics', 'Email support'], featuresFr: ['Gestion des commandes', 'Analytique de base', 'Support par e-mail'] },
  { id: 'pro', name: 'Professional', nameFr: 'Professionnel', priceUsd: 99, months: 1, perks: { promotions: true, flashNomination: true, coupons: true, bulkImport: true, teamSeats: 10 }, features: ['Promotions & flash sales', 'Advanced analytics', 'Priority support'], featuresFr: ['Promotions et ventes flash', 'Analytique avancée', 'Support prioritaire'], popular: true },
  { id: 'enterprise', name: 'Enterprise', nameFr: 'Entreprise', priceUsd: null, months: 1, perks: { promotions: true, flashNomination: true, coupons: true, bulkImport: true, teamSeats: null }, features: ['Multi-store', 'Custom commission', 'Dedicated manager', 'SLA & onboarding'], featuresFr: ['Multi-boutiques', 'Commission sur mesure', 'Gestionnaire dédié', 'SLA et accompagnement'] },
];

const ID = /^[a-z0-9][a-z0-9_-]{1,19}$/;

/** Validate a plan's `perks` (booleans, and a seat count); undefined / null = no perks object. */
function cleanPerks(raw: unknown): PlanPerks | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Plan perks must be an object.');
  const r = raw as Record<string, unknown>;
  const out: PlanPerks = {};
  for (const k of PERK_KEYS) {
    if (r[k] === undefined) continue;
    if (typeof r[k] !== 'boolean') throw new Error(`Plan perk ${k} must be true or false.`);
    out[k] = r[k] as boolean;
  }
  if (r.teamSeats !== undefined) {
    out.teamSeats = r.teamSeats === null ? null : num(r.teamSeats, 'Team seats', { min: 0, max: 1000, int: true });
  }
  return out;
}

/** Validate and normalise a `sellerPlans` value (JSON string or array). Throws a user-safe Error. */
export function validatePlans(value: unknown): SellerPlan[] {
  let raw: unknown;
  try {
    raw = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('Plans must be valid JSON.');
  }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) throw new Error('Plans must be a list of 1 to 10 plans.');
  const plans = raw.map((p: Record<string, unknown>): SellerPlan => {
    const id = str(p?.id, 'Plan id', { max: 20 });
    if (!ID.test(id)) throw new Error('Plan id must be 2-20 characters: lowercase letters, digits, - or _.');
    const priceUsd = p.priceUsd === null ? null : Number(num(p.priceUsd, 'Plan price', { min: 0, max: 100000 }).toFixed(2));
    const feats = (v: unknown, field: string) => {
      if (v === undefined) return undefined;
      if (!Array.isArray(v) || v.length > 20) throw new Error(`${field} must be a list of up to 20 items.`);
      return v.map((f) => str(f, field, { max: 120 }));
    };
    const perks = cleanPerks(p.perks);
    return {
      id,
      name: str(p.name, 'Plan name', { max: 60 }),
      ...(p.nameFr !== undefined ? { nameFr: str(p.nameFr, 'Plan name (FR)', { max: 60 }) } : {}),
      priceUsd,
      months: num(p.months ?? 1, 'Plan length (months)', { min: 1, max: 24, int: true }),
      ...(perks ? { perks } : {}),
      ...(p.maxProducts !== undefined && p.maxProducts !== null ? { maxProducts: num(p.maxProducts, 'Product limit', { min: 1, max: 1_000_000, int: true }) } : {}),
      features: feats(p.features ?? [], 'Features') ?? [],
      ...(p.featuresFr !== undefined ? { featuresFr: feats(p.featuresFr, 'Features (FR)') } : {}),
      ...(p.popular === true ? { popular: true } : {}),
    };
  });
  if (new Set(plans.map((p) => p.id)).size !== plans.length) throw new Error('Plan ids must be unique.');
  return plans;
}

/** The configured plans, or the defaults when the setting is missing / unreadable. */
export function parsePlans(raw: string | null | undefined): SellerPlan[] {
  if (!raw) return DEFAULT_SELLER_PLANS;
  try {
    return validatePlans(raw);
  } catch {
    return DEFAULT_SELLER_PLANS;
  }
}

/** New expiry after buying `months`: extends from the current expiry when it is still in the future. */
export function extendExpiry(current: Date | string | null | undefined, months: number, now = Date.now()): Date {
  const cur = current ? new Date(current).getTime() : 0;
  const d = new Date(Math.max(Number.isFinite(cur) ? cur : 0, now));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** The plan a seller is on right now: a lapsed paid plan falls back to 'free'. */
export function activePlanId(seller: { plan?: string | null; planExpiresAt?: Date | string | null }, now = Date.now()): string {
  const plan = seller.plan || 'free';
  if (plan === 'free') return 'free';
  const exp = seller.planExpiresAt ? new Date(seller.planExpiresAt).getTime() : 0;
  return exp > now ? plan : 'free';
}
