import { PromosService, percentDiscount } from './promos.service';

describe('percentDiscount', () => {
  it('rounds to the cent, never to whole dollars', () => {
    expect(percentDiscount(33.33, 10)).toBe(3.33);
    expect(percentDiscount(19.99, 15)).toBe(3);
    expect(percentDiscount(10.05, 10)).toBe(1.01); // 1.005 rounds half up
    expect(percentDiscount(7, 12.5)).toBe(0.88);
    expect(percentDiscount(100, 20)).toBe(20);
  });
});

describe('PromosService.validate', () => {
  const make = (promo: Record<string, unknown>) => {
    const promos = { findOne: async () => ({ active: true, minOrder: 0, maxUses: null, perUserLimit: null, expiresAt: null, code: 'SAVE', ...promo }) };
    return new PromosService(promos as never, {} as never, {} as never, {} as never, {} as never);
  };

  it('gives a percent coupon in cents and caps a fixed one at the subtotal', async () => {
    expect(await make({ type: 'percent', value: 15 }).validate('save', 19.99)).toMatchObject({ ok: true, discount: 3 });
    expect(await make({ type: 'percent', value: 10 }).validate('save', 33.33)).toMatchObject({ ok: true, discount: 3.33 });
    expect(await make({ type: 'fixed', value: 50 }).validate('save', 12.5)).toMatchObject({ ok: true, discount: 12.5 });
  });
});
