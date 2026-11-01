import { DEFAULT_SELLER_PLANS, validatePlans } from '../content/plans';
import type { SellerPlan } from '../content/plans';
import { PlanGateService, perkAllowed, perkError, seatError, seatsOf } from './plan-gate';

const plan = (perks?: SellerPlan['perks'], name = 'Test'): SellerPlan => ({ id: 'x', name, priceUsd: 0, months: 1, features: [], ...(perks ? { perks } : {}) });

describe('plan perks', () => {
  it('a perk that is not mentioned is allowed (plans saved before perks existed keep working)', () => {
    expect(perkAllowed(plan(), 'coupons')).toBe(true);
    expect(perkAllowed(plan({}), 'bulkImport')).toBe(true);
    expect(perkAllowed(undefined, 'promotions')).toBe(true);
  });
  it('an explicit false blocks it, an explicit true allows it', () => {
    expect(perkAllowed(plan({ coupons: false }), 'coupons')).toBe(false);
    expect(perkAllowed(plan({ coupons: true }), 'coupons')).toBe(true);
    expect(perkAllowed(plan({ coupons: false }), 'bulkImport')).toBe(true);
  });
  it('team seats: a number, 0 for none, missing / null for unlimited', () => {
    expect(seatsOf(plan({ teamSeats: 3 }))).toBe(3);
    expect(seatsOf(plan({ teamSeats: 0 }))).toBe(0);
    expect(seatsOf(plan({ teamSeats: null }))).toBeNull();
    expect(seatsOf(plan())).toBeNull();
    expect(seatsOf(undefined)).toBeNull();
  });
  it('error messages name the plan and what to do', () => {
    expect(perkError(plan({}, 'Starter'), 'coupons')).toBe('Your Starter plan does not include seller coupons. Upgrade your plan to use it.');
    expect(perkError(plan({}, 'Free'), 'flashNomination')).toBe('Your Free plan does not include flash-sale nominations. Upgrade your plan to use it.');
    expect(perkError(plan({}, 'Free'), 'bulkImport')).toMatch(/bulk import/);
    expect(seatError(plan({}, 'Free'), 1)).toBe('Your Free plan allows 1 team member. Upgrade your plan to invite more.');
    expect(seatError(plan({}, 'Starter'), 3)).toBe('Your Starter plan allows 3 team members. Upgrade your plan to invite more.');
    expect(seatError(plan({}, 'Free'), 0)).toMatch(/does not include team accounts/);
  });

  it('the built-in plans gate the right features and keep campaigns open to everyone', () => {
    const by = Object.fromEntries(DEFAULT_SELLER_PLANS.map((p) => [p.id, p]));
    expect(by.free.perks).toMatchObject({ promotions: true, coupons: false, flashNomination: false, bulkImport: false, teamSeats: 1 });
    expect(by.starter.perks).toMatchObject({ coupons: true, bulkImport: true, flashNomination: false, teamSeats: 3 });
    expect(by.pro.perks).toMatchObject({ coupons: true, bulkImport: true, flashNomination: true, teamSeats: 10 });
    expect(by.enterprise.perks?.teamSeats).toBeNull();
  });
});

describe('plan perks validation (sellerPlans setting)', () => {
  it('accepts valid perks and round-trips them', () => {
    const out = validatePlans([{ id: 'pro', name: 'Pro', priceUsd: 9, perks: { promotions: false, coupons: true, teamSeats: 4 } }]);
    expect(out[0].perks).toEqual({ promotions: false, coupons: true, teamSeats: 4 });
    expect(validatePlans(JSON.stringify(DEFAULT_SELLER_PLANS)).map((p) => p.perks)).toEqual(DEFAULT_SELLER_PLANS.map((p) => p.perks));
  });
  it('null seats means unlimited; no perks object stays absent', () => {
    expect(validatePlans([{ id: 'big', name: 'Big', priceUsd: 9, perks: { teamSeats: null } }])[0].perks?.teamSeats).toBeNull();
    expect(validatePlans([{ id: 'old', name: 'Old', priceUsd: 9 }])[0].perks).toBeUndefined();
  });
  it('refuses non-boolean perks, negative or fractional seats, and non-objects', () => {
    expect(() => validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: { coupons: 'yes' } }])).toThrow(/coupons must be true or false/);
    expect(() => validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: { teamSeats: -1 } }])).toThrow(/Team seats/);
    expect(() => validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: { teamSeats: 1.5 } }])).toThrow(/Team seats/);
    expect(() => validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: [] }])).toThrow(/perks must be an object/);
    expect(() => validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: 'all' }])).toThrow(/perks must be an object/);
  });
  it('ignores perk keys it does not know', () => {
    expect(validatePlans([{ id: 'a1', name: 'A', priceUsd: 1, perks: { hackerMode: true, coupons: true } }])[0].perks).toEqual({ coupons: true });
  });
});

describe('PlanGateService', () => {
  const settings = (plans: SellerPlan[] | null) => ({ get: async () => (plans ? JSON.stringify(plans) : null) });
  const store = (planId = 'free', expires: Date | null = null) => ({ plan: planId, planExpiresAt: expires });
  const plans: SellerPlan[] = [
    { id: 'free', name: 'Free', priceUsd: 0, months: 1, features: [], perks: { coupons: false, teamSeats: 1 } },
    { id: 'pro', name: 'Pro', priceUsd: 9, months: 1, features: [], perks: { coupons: true, teamSeats: null } },
  ];

  it('uses the plan in force: a paid plan counts while it lasts, a lapsed one falls back to free', async () => {
    const gate = new PlanGateService(settings(plans) as never);
    expect(await gate.allows(store('free'), 'coupons')).toBe(false);
    expect(await gate.allows(store('pro', new Date(Date.now() + 86_400_000)), 'coupons')).toBe(true);
    expect(await gate.allows(store('pro', new Date(Date.now() - 1000)), 'coupons')).toBe(false);
    expect(await gate.teamSeats(store('free'))).toBe(1);
    expect(await gate.teamSeats(store('pro', new Date(Date.now() + 86_400_000)))).toBeNull();
  });
  it('assert throws the message to show, and passes when allowed', async () => {
    const gate = new PlanGateService(settings(plans) as never);
    await expect(gate.assert(store('free'), 'coupons')).rejects.toThrow('Your Free plan does not include seller coupons. Upgrade your plan to use it.');
    await expect(gate.assert(store('free'), 'promotions')).resolves.toBeUndefined();
  });
  it('falls back to the built-in plans when the setting is missing or broken', async () => {
    expect(await new PlanGateService(settings(null) as never).teamSeats(store('free'))).toBe(1);
    expect(await new PlanGateService({ get: async () => 'not json' } as never).allows(store('free'), 'coupons')).toBe(false);
  });
  it('an unknown plan id on a store behaves as unlimited (nothing says otherwise)', async () => {
    const gate = new PlanGateService(settings(plans) as never);
    expect(await gate.allows(store('legacy', new Date(Date.now() + 86_400_000)), 'coupons')).toBe(true);
  });
});
