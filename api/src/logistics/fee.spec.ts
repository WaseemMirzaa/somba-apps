import { EXPRESS_FEE_DEFAULTS, FEE_DEFAULTS, deliveryFee, expressFee, expressFeeConfigFrom, feeConfigFrom } from './fee';

describe('delivery fee', () => {
  const cfg = FEE_DEFAULTS; // 2 + 0.5/km, max 15, transfer 1.5

  it('is base + per km, rounded to cents', () => {
    expect(deliveryFee(cfg, 0, false).feeUsd).toBe(2);
    expect(deliveryFee(cfg, 4, false).feeUsd).toBe(4);
    expect(deliveryFee(cfg, 3.333, false).feeUsd).toBe(3.67);
  });

  it('caps the base + distance part', () => {
    expect(deliveryFee(cfg, 100, false).feeUsd).toBe(15);
    expect(deliveryFee(cfg, 26, false).feeUsd).toBe(15);
  });

  it('adds the transfer fee on top of the cap when a parcel changes warehouse', () => {
    const f = deliveryFee(cfg, 100, true);
    expect(f.deliveryUsd).toBe(15);
    expect(f.transferUsd).toBe(1.5);
    expect(f.feeUsd).toBe(16.5);
    expect(deliveryFee(cfg, 4, true).feeUsd).toBe(5.5);
  });

  it('a flat area fee replaces base + km (and the cap) but the transfer fee still applies', () => {
    expect(deliveryFee(cfg, 40, false, 3).feeUsd).toBe(3);
    expect(deliveryFee(cfg, 40, false, 30).deliveryUsd).toBe(30);
    expect(deliveryFee(cfg, 40, true, 3).feeUsd).toBe(4.5);
    expect(deliveryFee(cfg, 4, false, 0).feeUsd).toBe(0);
    // null / undefined / negative overrides do nothing
    expect(deliveryFee(cfg, 4, false, null).feeUsd).toBe(4);
    expect(deliveryFee(cfg, 4, false, undefined).feeUsd).toBe(4);
    expect(deliveryFee(cfg, 4, false, -1).feeUsd).toBe(4);
  });

  it('treats a missing or negative distance as no distance', () => {
    expect(deliveryFee(cfg, NaN, false).feeUsd).toBe(2);
    expect(deliveryFee(cfg, -5, false).feeUsd).toBe(2);
  });

  it('reads the numbers from settings and falls back to the defaults for missing or broken ones', () => {
    expect(feeConfigFrom({})).toEqual(FEE_DEFAULTS);
    expect(feeConfigFrom({ deliveryBaseUsd: '3', deliveryPerKmUsd: '1', deliveryMaxUsd: '10', deliveryTransferUsd: '2' })).toEqual({ baseUsd: 3, perKmUsd: 1, maxUsd: 10, transferUsd: 2 });
    expect(feeConfigFrom({ deliveryBaseUsd: 'abc', deliveryPerKmUsd: '-1', deliveryMaxUsd: null })).toEqual(FEE_DEFAULTS);
    expect(feeConfigFrom({ deliveryBaseUsd: '0' }).baseUsd).toBe(0);
  });

  describe('express fee', () => {
    const x = EXPRESS_FEE_DEFAULTS; // 2 + 0.5/km, max 15

    it('is min(max, base + perKm x km) from the seller pin to the customer pin, rounded to cents', () => {
      expect(expressFee(x, 0).feeUsd).toBe(2);
      expect(expressFee(x, 4).feeUsd).toBe(4);
      expect(expressFee(x, 3.333).feeUsd).toBe(3.67);
      expect(expressFee(x, 100).feeUsd).toBe(15);
      expect(expressFee(x, 26).feeUsd).toBe(15);
      expect(expressFee(x, 4)).toEqual({ feeUsd: 4, deliveryUsd: 4, transferUsd: 0, distanceKm: 4 });
    });

    it('has no transfer fee and no area flat fee: it uses its own settings only', () => {
      expect(expressFee({ baseUsd: 1, perKmUsd: 0.2, maxUsd: 3 }, 10)).toMatchObject({ feeUsd: 3, transferUsd: 0 });
      // the standard fee of the same distance differs: an override or a transfer fee never reaches express
      expect(deliveryFee(FEE_DEFAULTS, 4, true, 30).feeUsd).toBe(31.5);
      expect(expressFee(x, 4).feeUsd).toBe(4);
    });

    it('treats a missing or negative distance as no distance', () => {
      expect(expressFee(x, NaN).feeUsd).toBe(2);
      expect(expressFee(x, -5).feeUsd).toBe(2);
    });

    it('reads the numbers from the express settings and falls back to the defaults for missing or broken ones', () => {
      expect(expressFeeConfigFrom({})).toEqual(EXPRESS_FEE_DEFAULTS);
      expect(expressFeeConfigFrom({ expressBaseUsd: '3', expressPerKmUsd: '1', expressMaxUsd: '10' })).toEqual({ baseUsd: 3, perKmUsd: 1, maxUsd: 10 });
      expect(expressFeeConfigFrom({ expressBaseUsd: 'abc', expressPerKmUsd: '-1', expressMaxUsd: null })).toEqual(EXPRESS_FEE_DEFAULTS);
      // the standard keys are not the express keys
      expect(expressFeeConfigFrom({ deliveryBaseUsd: '9' })).toEqual(EXPRESS_FEE_DEFAULTS);
    });
  });
});
