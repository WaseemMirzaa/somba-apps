import { allocate, DEFAULT_VAT_PCT, feePayerOf, orderLineMoney, parseVatConfig, vatOn, vatPctFor, vatShareUsd } from './vat';

describe('vat rules (pure)', () => {
  it('VAT is off unless the switch says "true", and a broken rate falls back to 16', () => {
    expect(parseVatConfig(null, null)).toEqual({ enabled: false, defaultPct: DEFAULT_VAT_PCT });
    expect(parseVatConfig('false', '20')).toEqual({ enabled: false, defaultPct: 20 });
    expect(parseVatConfig('true', 'abc')).toEqual({ enabled: true, defaultPct: 16 });
    expect(parseVatConfig('true', '99').defaultPct).toBe(50);
  });

  it('the line rate is the category rate (0 is real), else the default, and 0 while off', () => {
    const on = parseVatConfig('true', '16');
    expect(vatPctFor(on, null)).toBe(16);
    expect(vatPctFor(on, undefined)).toBe(16);
    expect(vatPctFor(on, 0)).toBe(0);
    expect(vatPctFor(on, 8)).toBe(8);
    expect(vatPctFor(parseVatConfig('false', '16'), 8)).toBe(0);
  });

  it('who pays the fee: only "seller" moves it, everything else is today (customer)', () => {
    expect(feePayerOf('seller')).toBe('seller');
    expect(feePayerOf('customer')).toBe('customer');
    expect(feePayerOf(null)).toBe('customer');
    expect(feePayerOf('x')).toBe('customer');
  });

  it('VAT is rounded to the cent', () => {
    expect(vatOn(19.99, 16)).toBe(3.2); // 3.1984
    expect(vatOn(0.05, 16)).toBe(0.01);
    expect(vatOn(10, 0)).toBe(0);
    expect(vatOn(-5, 16)).toBe(0);
  });

  it('allocate splits in whole cents that always add up', () => {
    expect(allocate(1, [1, 1, 1])).toEqual([0.34, 0.33, 0.33]);
    expect(allocate(3, [20, 10])).toEqual([2, 1]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
    const parts = allocate(7.77, [3.33, 4.44, 1.11, 9.99]);
    expect(Math.round(parts.reduce((t, p) => t + p, 0) * 100)).toBe(777);
  });

  it('orderLineMoney: VAT is on the line after its share of the discount; the seller fee is split by value', () => {
    const m = orderLineMoney({ lines: [{ priceUsd: 20, qty: 1 }, { priceUsd: 10, qty: 1 }], discountUsd: 3, vatPcts: [16, 16], feeUsd: 3, feePaidBy: 'seller' });
    expect(m.discountUsd).toEqual([2, 1]);
    expect(m.vatUsd).toEqual([2.88, 1.44]); // (20-2)*16%, (10-1)*16%
    expect(m.vatTotalUsd).toBe(4.32);
    expect(m.feeUsd).toEqual([2, 1]);
  });

  it('orderLineMoney: a store coupon names each line\'s discount; the customer-paid fee is not split; 0% lines carry no VAT', () => {
    const m = orderLineMoney({ lines: [{ priceUsd: 20, qty: 1 }, { priceUsd: 10, qty: 2 }], discountUsd: 5, lineDiscounts: [5, 0], vatPcts: [16, 0], feeUsd: 3, feePaidBy: 'customer' });
    expect(m.vatUsd).toEqual([2.4, 0]);
    expect(m.feeUsd).toEqual([0, 0]);
  });

  it('vatShareUsd: a whole line carries all its VAT, a part its share', () => {
    const line = { priceUsd: 10, qty: 4, vatUsd: 6.4 };
    expect(vatShareUsd(line, 40)).toBe(6.4);
    expect(vatShareUsd(line, 10)).toBe(1.6);
    expect(vatShareUsd(line, 400)).toBe(6.4);
    expect(vatShareUsd({ priceUsd: 10, qty: 1 }, 10)).toBe(0);
  });
});
