import { DEFAULT_SELLER_PLANS, activePlanId, extendExpiry, parsePlans, validatePlans } from './plans';

describe('seller plans', () => {
  it('defaults are valid and include a free plan', () => {
    expect(validatePlans(JSON.stringify(DEFAULT_SELLER_PLANS)).map((p) => p.id)).toEqual(['free', 'starter', 'pro', 'enterprise']);
  });
  it('rejects bad plans', () => {
    expect(() => validatePlans('{not json')).toThrow(/JSON/);
    expect(() => validatePlans([])).toThrow(/list/);
    expect(() => validatePlans([{ id: 'Bad Id', name: 'x', priceUsd: 5 }])).toThrow(/Plan id/);
    expect(() => validatePlans([{ id: 'ok', name: 'x', priceUsd: -5 }])).toThrow(/price/);
    expect(() => validatePlans([{ id: 'ok', name: 'x', priceUsd: 5 }, { id: 'ok', name: 'y', priceUsd: 6 }])).toThrow(/unique/);
    expect(() => validatePlans([{ id: 'ok', name: 'x', priceUsd: 5, months: 0 }])).toThrow(/months/);
  });
  it('allows a null price (contact sales)', () => {
    expect(validatePlans([{ id: 'big', name: 'Big', priceUsd: null }])[0].priceUsd).toBeNull();
  });
  it('falls back to the defaults on garbage', () => {
    expect(parsePlans(null)).toBe(DEFAULT_SELLER_PLANS);
    expect(parsePlans('nope')).toBe(DEFAULT_SELLER_PLANS);
  });
  it('extends from the current expiry when it is still running, else from now', () => {
    const now = Date.parse('2026-10-17T00:00:00Z');
    expect(extendExpiry(null, 1, now).toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(extendExpiry('2026-12-01T00:00:00Z', 1, now).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(extendExpiry('2026-01-01T00:00:00Z', 3, now).toISOString()).toBe('2027-01-17T00:00:00.000Z');
  });
  it('a lapsed paid plan counts as free', () => {
    const now = Date.parse('2026-10-17T00:00:00Z');
    expect(activePlanId({ plan: 'pro', planExpiresAt: new Date('2026-11-01') }, now)).toBe('pro');
    expect(activePlanId({ plan: 'pro', planExpiresAt: new Date('2026-09-01') }, now)).toBe('free');
    expect(activePlanId({ plan: 'pro', planExpiresAt: null }, now)).toBe('free');
    expect(activePlanId({ plan: 'free' }, now)).toBe('free');
  });
});
