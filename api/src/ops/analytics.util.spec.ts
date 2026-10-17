import { clampDays, computeStoreHealth, dayKeyOf, fillDays, lastDays, pct, sortAlerts, toDate } from './analytics.util';

describe('daily buckets', () => {
  const now = new Date('2026-10-17T15:30:00Z');
  it('lists the last N UTC days oldest first and includes today', () => {
    const { keys, from } = lastDays(3, now);
    expect(keys).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(from.toISOString()).toBe('2026-10-14T23:59:59.999Z');
  });
  it('zero-fills days without data and keeps order', () => {
    const { keys } = lastDays(4, now);
    const out = fillDays(keys, [{ day: '2026-10-16', revenue: 12.345, orders: 2 }, { day: new Date('2026-10-17T00:00:00Z'), revenue: 5, orders: 1 }], { revenue: 0, orders: 0 });
    expect(out).toEqual([
      { date: '2026-10-14', revenue: 0, orders: 0 },
      { date: '2026-10-15', revenue: 0, orders: 0 },
      { date: '2026-10-16', revenue: 12.35, orders: 2 },
      { date: '2026-10-17', revenue: 5, orders: 1 },
    ]);
  });
  it('clamps the days parameter', () => {
    expect(clampDays(undefined, 7)).toBe(7);
    expect(clampDays(0, 7)).toBe(7);
    expect(clampDays('30', 7)).toBe(30);
    expect(clampDays(500, 7)).toBe(90);
  });
  it('normalises driver date values', () => {
    expect(dayKeyOf('2026-10-17')).toBe('2026-10-17');
    expect(dayKeyOf('2026-10-17 08:00:00')).toBe('2026-10-17');
    expect(toDate('2026-10-17 08:00:00')?.toISOString()).toBe('2026-10-17T08:00:00.000Z');
    expect(toDate(null)).toBeNull();
  });
  it('pct is safe on zero', () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33.3);
  });
});

describe('store health', () => {
  const base = { orders: 50, avgHoursToReady: 12, cancelRatePct: 0, problemRatePct: 0, ratingAvg: 5, ratingCount: 10, repeatRatePct: 30 };
  it('a perfect store scores 100 / A', () => {
    expect(computeStoreHealth(base)).toMatchObject({ score: 100, grade: 'A' });
  });
  it('a terrible store scores 0 / D', () => {
    expect(computeStoreHealth({ ...base, avgHoursToReady: 80, cancelRatePct: 25, problemRatePct: 20, ratingAvg: 1.5, repeatRatePct: 0 })).toMatchObject({ score: 0, grade: 'D' });
  });
  it('weights add up: 24h to pack is 83 points x 25%', () => {
    const h = computeStoreHealth({ ...base, avgHoursToReady: 24 });
    const ready = h.components.find((c) => c.key === 'ready')!;
    expect(ready.score).toBe(80);
    expect(h.score).toBe(Math.round(100 - 20 * 0.25));
  });
  it('leaves out what has no data and re-normalises', () => {
    const h = computeStoreHealth({ orders: 10, avgHoursToReady: null, cancelRatePct: 0, problemRatePct: 0, ratingAvg: null, ratingCount: 0, repeatRatePct: null });
    expect(h.components.map((c) => c.key)).toEqual(['cancel', 'problems']);
    expect(h.score).toBe(100);
  });
  it('is null when there is nothing to judge', () => {
    expect(computeStoreHealth({ orders: 0, avgHoursToReady: null, cancelRatePct: 0, problemRatePct: 0, ratingAvg: null, ratingCount: 0, repeatRatePct: null })).toEqual({ score: null, grade: null, components: [] });
  });
  it('grades at the documented thresholds', () => {
    const grade = (cancel: number) => computeStoreHealth({ orders: 10, avgHoursToReady: null, cancelRatePct: cancel, problemRatePct: 0, ratingAvg: null, ratingCount: 0, repeatRatePct: null }).grade;
    expect(grade(0)).toBe('A');
    expect(grade(10)).toBe('B'); // cancel 50 pts, problems 100 -> (50*.25+100*.2)/.45 = 72
    expect(grade(14)).toBe('C'); // cancel 30 pts -> (7.5+20)/.45 = 61
    expect(grade(18)).toBe('D'); // cancel 10 pts -> (2.5+20)/.45 = 50
  });
});

describe('alerts', () => {
  it('drops empty alerts and orders by severity then count', () => {
    const mk = (kind: string, severity: 'info' | 'warning' | 'critical', count: number) => ({ kind, severity, count, message: kind, messageFr: kind });
    expect(sortAlerts([mk('a', 'info', 9), mk('b', 'critical', 1), mk('c', 'warning', 0), mk('d', 'warning', 4), mk('e', 'critical', 3)]).map((a) => a.kind)).toEqual(['e', 'b', 'd', 'a']);
  });
});
