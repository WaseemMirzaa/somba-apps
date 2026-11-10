import { estimateOrder } from './order-estimate';
import { localDay } from '../common/delivery/estimate';

const origin = (sellerId: string | null, extraDays = 0) => ({ sellerId, extraDays }) as never;
const route = (origins: unknown[], localDeliveryDays = 1) => ({ origins, localDeliveryDays }) as never;
const NOW = new Date('2026-10-22T23:30:00Z'); // 2026-10-23 in Kinshasa

describe('estimateOrder (per seller: prep + handling + route)', () => {
  it('one local seller: prep + handling + the platform\'s local days, and the date is that many days from today', () => {
    const e = estimateOrder(route([origin('a')]), [{ sellerId: 'a', prepDays: 3, handlingDays: 1 }], NOW);
    expect(e).toMatchObject({ deliveryMode: 'standard', prepDays: 4, routeDays: 1, estimateDays: 5, estimatedDeliveryDate: localDay(NOW, 5), days: 5, date: localDay(NOW, 5) });
    expect(e.sellers).toEqual([{ sellerId: 'a', prepDays: 4, routeDays: 1, estimateDays: 5, estimatedDeliveryDate: localDay(NOW, 5) }]);
  });

  it('prep 0 counts as 0: the estimate is just the route', () => {
    expect(estimateOrder(route([origin('a')]), [{ sellerId: 'a', prepDays: 0, handlingDays: 0 }], NOW)).toMatchObject({ prepDays: 0, estimateDays: 1 });
    expect(estimateOrder(route([origin('a')], 0), [{ sellerId: 'a', prepDays: 0, handlingDays: 0 }], NOW)).toMatchObject({ estimateDays: 0, estimatedDeliveryDate: localDay(NOW, 0) });
  });

  it('the slowest SELLER decides, not max(prep) + max(route): a slow-prep local seller and a quick far one', () => {
    const e = estimateOrder(route([origin('slow', 0), origin('far', 4)]), [
      { sellerId: 'slow', prepDays: 5, handlingDays: 0 },
      { sellerId: 'far', prepDays: 0, handlingDays: 0 },
    ], NOW);
    expect(e.sellers.map((s) => s.estimateDays)).toEqual([6, 5]);
    expect(e).toMatchObject({ estimateDays: 6, prepDays: 5, routeDays: 1 });
    // far seller slower
    const f = estimateOrder(route([origin('slow', 0), origin('far', 6)]), [
      { sellerId: 'slow', prepDays: 1, handlingDays: 0 },
      { sellerId: 'far', prepDays: 1, handlingDays: 0 },
    ], NOW);
    expect(f).toMatchObject({ estimateDays: 8, prepDays: 1, routeDays: 7 });
  });

  it('several lines of one seller use its slowest preparation and handling', () => {
    const e = estimateOrder(route([origin('a')]), [
      { sellerId: 'a', prepDays: 1, handlingDays: 2 },
      { sellerId: 'a', prepDays: 4, handlingDays: 2 },
    ], NOW);
    expect(e).toMatchObject({ prepDays: 6, estimateDays: 7 });
  });

  it('is capped at 30 days, and a line with no listing (null seller) works', () => {
    expect(estimateOrder(route([origin('a', 20)]), [{ sellerId: 'a', prepDays: 30, handlingDays: 14 }], NOW).estimateDays).toBe(30);
    expect(estimateOrder(route([origin(null)]), [{ sellerId: null, prepDays: 2, handlingDays: 0 }], NOW).estimateDays).toBe(3);
  });

  it('a seller with no origin row still gets the local days; no lines gives null numbers and the 3-day default date', () => {
    expect(estimateOrder(route([]), [{ sellerId: 'x', prepDays: 1, handlingDays: 0 }], NOW).estimateDays).toBe(2);
    expect(estimateOrder(route([]), [], NOW)).toMatchObject({ prepDays: null, routeDays: null, estimateDays: null, estimatedDeliveryDate: null, days: 3, date: localDay(NOW, 3) });
  });
});
