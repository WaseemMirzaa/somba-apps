import { quoteFor, seesFeeBreakdown } from './quote-view';

const full = () => ({
  feeUsd: 6.5,
  deliveryUsd: 4,
  transferUsd: 2.5,
  defaultTransferUsd: 1.5,
  distanceKm: 3.2,
  feeOverrideUsd: 5,
  served: true,
  express: false,
  estimatedDeliveryDate: '2026-11-20',
  estimateDays: 4,
  transfer: true,
  origins: [{ sellerId: 's1', hubName: 'A', hops: [{ fromHubName: 'A', toHubName: 'B', transitHours: 24, costUsd: 2.5, laneCost: true }] }],
});

describe('delivery:quote is role-aware', () => {
  it('staff and every admin role keep the full breakdown, plus platformFeeUsd', () => {
    for (const role of ['admin', 'admin_operations', 'admin_finance', 'warehouse_staff']) {
      const q = quoteFor(full(), role);
      expect(q).toMatchObject({ platformFeeUsd: 6.5, feeUsd: 6.5, deliveryUsd: 4, transferUsd: 2.5, defaultTransferUsd: 1.5, distanceKm: 3.2, feeOverrideUsd: 5 });
      expect(q.origins[0].hops[0]).toMatchObject({ costUsd: 2.5, laneCost: true });
    }
  });

  it('customers, guests and sellers get ONE number and the estimate, with no breakdown anywhere', () => {
    for (const role of ['customer', 'guest', 'seller', 'rider', undefined]) {
      const q = quoteFor(full(), role) as Record<string, unknown>;
      expect(q).toMatchObject({ platformFeeUsd: 6.5, feeUsd: 6.5, served: true, express: false, estimatedDeliveryDate: '2026-11-20', estimateDays: 4 });
      for (const k of ['deliveryUsd', 'transferUsd', 'defaultTransferUsd', 'distanceKm', 'feeOverrideUsd']) expect(q).not.toHaveProperty(k);
      const json = JSON.stringify(q);
      expect(json).not.toMatch(/costUsd|laneCost/);
      // the route itself (which warehouses, how long) is not a price and stays
      expect((q.origins as { hops: object[] }[])[0].hops[0]).toEqual({ fromHubName: 'A', toHubName: 'B', transitHours: 24 });
    }
  });

  it('does not change the object it was given and sums to cents', () => {
    const input = full();
    quoteFor(input, 'customer');
    expect(input.deliveryUsd).toBe(4);
    expect(quoteFor({ feeUsd: 0.1 + 0.2 }, 'customer').platformFeeUsd).toBe(0.3);
  });

  it('who sees the breakdown', () => {
    expect(seesFeeBreakdown('customer')).toBe(false);
    expect(seesFeeBreakdown('guest')).toBe(false);
    expect(seesFeeBreakdown('seller')).toBe(false);
    expect(seesFeeBreakdown('admin_support')).toBe(true);
  });
});
