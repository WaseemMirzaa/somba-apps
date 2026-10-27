import { DELIVERY_DAYS, deliveryDaysOf, estimatedDeliveryDate, localDay } from './estimate';

describe('delivery estimate', () => {
  // 2026-10-22 23:30 UTC is already 2026-10-23 in Kinshasa (UTC+1).
  const lateEvening = new Date('2026-10-22T23:30:00Z');

  it('counts days from the Kinshasa calendar day', () => {
    expect(localDay(lateEvening)).toBe('2026-10-23');
    expect(localDay(lateEvening, 2)).toBe('2026-10-25');
  });

  it('uses the slowest line of the order', () => {
    expect(estimatedDeliveryDate([1, 4, 2], lateEvening)).toBe('2026-10-27');
  });

  it('adds the days parcels spend travelling between cities / over lanes, never beyond the maximum', () => {
    expect(estimatedDeliveryDate([1, 4, 2], lateEvening, 3)).toBe('2026-10-30'); // 4 + 3
    expect(estimatedDeliveryDate([2], lateEvening, 0)).toBe(estimatedDeliveryDate([2], lateEvening));
    expect(estimatedDeliveryDate([2], lateEvening, -4)).toBe(estimatedDeliveryDate([2], lateEvening));
    expect(estimatedDeliveryDate([2], lateEvening, NaN)).toBe(estimatedDeliveryDate([2], lateEvening));
    expect(estimatedDeliveryDate([28], lateEvening, 10)).toBe(localDay(lateEvening, DELIVERY_DAYS.max));
  });

  it('falls back for missing or broken values and caps very long ones', () => {
    expect(deliveryDaysOf(undefined)).toBe(DELIVERY_DAYS.fallback);
    expect(deliveryDaysOf(0)).toBe(DELIVERY_DAYS.fallback);
    expect(deliveryDaysOf('abc')).toBe(DELIVERY_DAYS.fallback);
    expect(deliveryDaysOf(99)).toBe(DELIVERY_DAYS.max);
    expect(estimatedDeliveryDate([], lateEvening)).toBe('2026-10-26');
  });
});
