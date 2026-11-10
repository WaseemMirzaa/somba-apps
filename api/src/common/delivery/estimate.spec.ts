import { DELIVERY_DAYS, PREP_DAYS, deliveryDaysOf, estimateFromParts, estimatedDeliveryDate, legacyDeliveryDays, localDay, localDaysOf, prepDaysOf, prepFromLegacy, routeDaysFor, totalDays } from './estimate';

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

describe('preparation + transit', () => {
  const lateEvening = new Date('2026-10-22T23:30:00Z'); // 2026-10-23 in Kinshasa

  it('prepDaysOf accepts 0 (it is not the fallback), clamps, and derives from the legacy figure when unset', () => {
    expect(prepDaysOf(0)).toBe(0);
    expect(prepDaysOf('3')).toBe(3);
    expect(prepDaysOf(99)).toBe(30);
    expect(prepDaysOf(undefined)).toBe(PREP_DAYS.fallback);
    expect(prepDaysOf(null, null)).toBe(2);
    expect(prepDaysOf(undefined, 4)).toBe(3); // 4 - 1 transit day
    expect(prepDaysOf(undefined, 4, 3)).toBe(1);
    expect(prepDaysOf(undefined, 1)).toBe(0); // never below 0
    expect(prepDaysOf(-2, 5)).toBe(4); // a broken prep falls through to the legacy figure
    expect(prepDaysOf('abc')).toBe(2);
  });

  it('localDaysOf reads the setting; unset or broken is 1 and 0 is valid', () => {
    expect(localDaysOf(undefined)).toBe(1);
    expect(localDaysOf('')).toBe(1);
    expect(localDaysOf('0')).toBe(0);
    expect(localDaysOf('3')).toBe(3);
    expect(localDaysOf('x')).toBe(1);
    expect(localDaysOf(99)).toBe(30);
  });

  it('the served figures: total = prep + handling + local (1..30); legacy = prep + local (1..30, no handling); the write converts back', () => {
    expect(totalDays(3, 2, 1)).toBe(6);
    expect(totalDays(0, 0, 0)).toBe(1);
    expect(totalDays(30, 14, 5)).toBe(30);
    expect(legacyDeliveryDays(3, 1)).toBe(4);
    expect(legacyDeliveryDays(0, 0)).toBe(1);
    expect(legacyDeliveryDays(30, 5)).toBe(30);
    for (const legacy of [1, 2, 4, 15, 30]) expect(legacyDeliveryDays(prepFromLegacy(legacy, 1), 1)).toBe(legacy);
    expect(prepFromLegacy(1, 3)).toBe(0);
  });

  it('routeDaysFor: standard = local + the lane / inter-city days; express = the express days', () => {
    expect(routeDaysFor({ local: 1 })).toBe(1);
    expect(routeDaysFor({ local: 1, extraDays: 3 })).toBe(4);
    expect(routeDaysFor({ local: 0, extraDays: -2 })).toBe(0);
    expect(routeDaysFor({ local: 1, extraDays: NaN })).toBe(1);
    expect(routeDaysFor({ local: 1, extraDays: 3, express: true, expressDays: 0 })).toBe(0);
    expect(routeDaysFor({ local: 1, express: true, expressDays: 2 })).toBe(2);
  });

  it('estimateFromParts: the slowest SELLER decides (prep + handling + its own route), at most 30', () => {
    // A: slow prep, local. B: quick prep, far away. Per seller beats max(prep) + max(route): 5 + 4 = 9 would overestimate.
    const parts = [{ prep: 4, handling: 1, route: 1 }, { prep: 0, route: 4 }];
    const r = estimateFromParts(parts, lateEvening);
    expect(r.days).toBe(6);
    expect(r.date).toBe('2026-10-29');
    expect(r.deciding).toBe(parts[0]);
    expect(estimateFromParts([{ prep: 28, handling: 14, route: 9 }], lateEvening).days).toBe(30);
    expect(estimateFromParts([{ prep: 0, route: 0 }], lateEvening).date).toBe('2026-10-23'); // express, 0 days: the same day
    expect(estimateFromParts([], lateEvening)).toMatchObject({ days: 3, date: '2026-10-26', deciding: null });
  });

  it('estimatedDeliveryDate stays as the wrapper over a list of total days', () => {
    expect(estimatedDeliveryDate([1, 4, 2], lateEvening, 3)).toBe('2026-10-30');
  });
});
