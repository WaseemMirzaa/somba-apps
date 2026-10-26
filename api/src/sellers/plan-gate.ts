import { Injectable } from '@nestjs/common';
import { SettingsService } from '../content/settings.service';
import { DEFAULT_SELLER_PLANS, activePlanId, parsePlans } from '../content/plans';
import type { PerkKey, SellerPlan } from '../content/plans';

const LABELS: Record<PerkKey, string> = {
  promotions: 'promotions',
  flashNomination: 'flash-sale nominations',
  coupons: 'seller coupons',
  bulkImport: 'bulk import',
};

/** Is the perk on for this plan? A plan (or a legacy plan) that does not mention it allows it. */
export function perkAllowed(plan: SellerPlan | undefined, key: PerkKey): boolean {
  return plan?.perks?.[key] !== false;
}

/** Staff accounts besides the owner this plan allows; null = unlimited. */
export function seatsOf(plan: SellerPlan | undefined): number | null {
  const n = plan?.perks?.teamSeats;
  return n === undefined || n === null ? null : n;
}

export const perkError = (plan: SellerPlan | undefined, key: PerkKey) =>
  `Your ${plan?.name ?? 'current'} plan does not include ${LABELS[key]}. Upgrade your plan to use it.`;

export const seatError = (plan: SellerPlan | undefined, seats: number) =>
  seats === 0
    ? `Your ${plan?.name ?? 'current'} plan does not include team accounts. Upgrade your plan to invite staff.`
    : `Your ${plan?.name ?? 'current'} plan allows ${seats} team ${seats === 1 ? 'member' : 'members'}. Upgrade your plan to invite more.`;

/**
 * Plan features that map to real features are enforced here. Other builders call it from their own handlers:
 *
 *   await this.planGate.assert(ctx.seller, 'coupons');        // throws the message to show the seller
 *   if (await this.planGate.allows(ctx.seller, 'bulkImport')) …
 */
@Injectable()
export class PlanGateService {
  constructor(private readonly settings: SettingsService) {}

  /** The plan a store is on right now (a lapsed paid plan counts as free). */
  async planOf(seller: { plan?: string | null; planExpiresAt?: Date | string | null }): Promise<SellerPlan | undefined> {
    const plans = parsePlans(await this.settings.get('sellerPlans'));
    const id = activePlanId(seller);
    return plans.find((p) => p.id === id) ?? DEFAULT_SELLER_PLANS.find((p) => p.id === id);
  }

  async allows(seller: { plan?: string | null; planExpiresAt?: Date | string | null }, key: PerkKey): Promise<boolean> {
    return perkAllowed(await this.planOf(seller), key);
  }

  async assert(seller: { plan?: string | null; planExpiresAt?: Date | string | null }, key: PerkKey): Promise<void> {
    const plan = await this.planOf(seller);
    if (!perkAllowed(plan, key)) throw new Error(perkError(plan, key));
  }

  async teamSeats(seller: { plan?: string | null; planExpiresAt?: Date | string | null }): Promise<number | null> {
    return seatsOf(await this.planOf(seller));
  }
}
