import { FEE_DEFAULTS, deliveryFee, feeConfigFrom } from './fee';

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
});
