import {
  DEFAULT_HUB_OPS,
  HubOps,
  ageHours,
  canReturnToSeller,
  dueLevels,
  isVoidedFailure,
  isWorkingNow,
  levelOf,
  localClock,
  mergeHubOps,
  pickLeastBusy,
} from './hub-ops-rules';

describe('mergeHubOps (settings validation)', () => {
  const merge = (patch: unknown, cur: HubOps = DEFAULT_HUB_OPS) => mergeHubOps(cur, patch);

  it('keeps the current values for anything not sent, and ignores unknown fields', () => {
    expect(merge({})).toEqual(DEFAULT_HUB_OPS);
    expect(merge({ nonsense: 1, hubId: 'x' })).toEqual(DEFAULT_HUB_OPS);
    expect(merge(null)).toEqual(DEFAULT_HUB_OPS);
  });

  it('accepts a full valid change', () => {
    const next = merge({ workStart: '07:30', workEnd: '17:00', workDays: [1, 2, 3, 4, 5], timezone: 'Africa/Lubumbashi', batchSize: 40, autoAssign: true, agedLevels: [12, 36, 60], deliveryTargetHours: 18.5 });
    expect(next).toMatchObject({ workStart: '07:30', workEnd: '17:00', workDays: [1, 2, 3, 4, 5], timezone: 'Africa/Lubumbashi', batchSize: 40, autoAssign: true, agedLevels: [12, 36, 60], deliveryTargetHours: 18.5 });
  });

  it('does not change the object it was given', () => {
    const before = JSON.stringify(DEFAULT_HUB_OPS);
    merge({ batchSize: 3, agedLevels: [1, 2, 3], workDays: [7] });
    expect(JSON.stringify(DEFAULT_HUB_OPS)).toBe(before);
  });

  it.each([
    [{ workStart: '8:00' }, /Opening time must be a time/],
    [{ workStart: '25:00' }, /Opening time must be a time/],
    [{ workEnd: 'late' }, /Closing time must be a time/],
    [{ workStart: '18:00', workEnd: '08:00' }, /Closing time must be after opening time/],
    [{ workStart: '09:00', workEnd: '09:00' }, /Closing time must be after opening time/],
    [{ workEnd: '07:00' }, /Closing time must be after opening time/], // against the stored opening time
    [{ workDays: [] }, /at least one working day/],
    [{ workDays: [0, 1] }, /weekdays from 1/],
    [{ workDays: [8] }, /weekdays from 1/],
    [{ workDays: 'mon' }, /weekdays from 1/],
    [{ workDays: 5 }, /list of weekdays/],
    [{ timezone: 'Mars/Olympus' }, /valid time zone/],
    [{ timezone: '' }, /Time zone must be/],
    [{ batchSize: 0 }, /Batch size must be a whole number between 1 and 200/],
    [{ batchSize: 201 }, /Batch size must be a whole number between 1 and 200/],
    [{ batchSize: 2.5 }, /Batch size must be a whole number/],
    [{ batchSize: 'many' }, /Batch size must be a whole number/],
    [{ autoAssign: 'yes' }, /Auto-assignment must be on or off/],
    [{ autoAssign: 1 }, /Auto-assignment must be on or off/],
    [{ autoAssignRule: 'random' }, /Auto-assignment rule must be one of: least_busy/],
    [{ agedLevels: [24, 48] }, /three ages/],
    [{ agedLevels: 'x' }, /three ages/],
    [{ agedLevels: [0, 48, 72] }, /Alert level 1 age/],
    [{ agedLevels: [24, 48, 721] }, /Alert level 3 age/],
    [{ agedLevels: [24, 24, 72] }, /must increase/],
    [{ agedLevels: [72, 48, 24] }, /must increase/],
    [{ agedLevels: [24, 48.5, 72] }, /Alert level 2 age must be a whole number/],
    [{ deliveryTargetHours: 0 }, /Delivery-time target/],
    [{ deliveryTargetHours: 241 }, /Delivery-time target/],
    [{ deliveryTargetHours: null }, /Delivery-time target/],
  ])('refuses %j', (patch, message) => {
    expect(() => merge(patch)).toThrow(message);
  });

  it('validates the result, so one age cannot leave the three out of order', () => {
    const cur = merge({ agedLevels: [10, 20, 30] });
    expect(cur.agedLevels).toEqual([10, 20, 30]);
    // only level 1 is sent, as a replacement list that is out of order against nothing: the list is whole by contract
    expect(() => merge({ agedLevels: [40, 20, 30] }, cur)).toThrow(/must increase/);
  });

  it('accepts working days as a comma-separated string (the stored form) and sorts and de-duplicates them', () => {
    expect(merge({ workDays: '6,1,1,3' }).workDays).toEqual([1, 3, 6]);
  });
});

describe('working hours', () => {
  // 2026-11-02 is a Monday. Kinshasa is UTC+1 all year.
  const kin = { workStart: '08:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5, 6], timezone: 'Africa/Kinshasa' };

  it('reads the clock in the warehouse time zone', () => {
    expect(localClock(new Date('2026-11-02T07:00:00Z'), 'Africa/Kinshasa')).toEqual({ weekday: 1, minutes: 8 * 60 });
    expect(localClock(new Date('2026-11-02T23:30:00Z'), 'Africa/Kinshasa')).toEqual({ weekday: 2, minutes: 30 }); // already Tuesday there
    expect(localClock(new Date('2026-11-01T12:00:00Z'), 'UTC')).toEqual({ weekday: 7, minutes: 12 * 60 }); // Sunday is 7
  });

  it('is open from opening (inclusive) to closing (exclusive) on a working day', () => {
    expect(isWorkingNow(kin, new Date('2026-11-02T06:59:00Z'))).toBe(false); // 07:59 local
    expect(isWorkingNow(kin, new Date('2026-11-02T07:00:00Z'))).toBe(true); // 08:00 local
    expect(isWorkingNow(kin, new Date('2026-11-02T16:59:00Z'))).toBe(true); // 17:59 local
    expect(isWorkingNow(kin, new Date('2026-11-02T17:00:00Z'))).toBe(false); // 18:00 local
  });

  it('is closed on a day that is not a working day', () => {
    expect(isWorkingNow(kin, new Date('2026-11-01T10:00:00Z'))).toBe(false); // Sunday
    expect(isWorkingNow({ ...kin, workDays: [7] }, new Date('2026-11-01T10:00:00Z'))).toBe(true);
  });

  it('follows the zone, not the server clock', () => {
    const utc = { ...kin, timezone: 'UTC' };
    expect(isWorkingNow(utc, new Date('2026-11-02T07:30:00Z'))).toBe(false); // 07:30 in UTC
    expect(isWorkingNow(kin, new Date('2026-11-02T07:30:00Z'))).toBe(true); // 08:30 in Kinshasa
  });
});

describe('aged-parcel levels', () => {
  const levels = [24, 48, 72];
  it('has no level before the first age, then 1, 2, 3', () => {
    expect(levelOf(0, levels)).toBe(0);
    expect(levelOf(23.99, levels)).toBe(0);
    expect(levelOf(24, levels)).toBe(1);
    expect(levelOf(47.9, levels)).toBe(1);
    expect(levelOf(48, levels)).toBe(2);
    expect(levelOf(72, levels)).toBe(3);
    expect(levelOf(5000, levels)).toBe(3);
  });
  it('lists every level reached', () => {
    expect(dueLevels(50, levels)).toEqual([1, 2]);
    expect(dueLevels(80, [10, 20, 30])).toEqual([1, 2, 3]);
    expect(dueLevels(5, levels)).toEqual([]);
  });
  it('measures age in hours and never below zero', () => {
    expect(ageHours(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T06:00:00Z'))).toBe(30);
    expect(ageHours(new Date('2026-11-03T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))).toBe(0);
  });
});

describe('return to seller rules', () => {
  it('is only for a customer-bound leg still at the warehouse and outside a run', () => {
    expect(canReturnToSeller({ kind: 'delivery', status: 'unassigned' })).toBe(true);
    expect(canReturnToSeller({ kind: 'delivery', status: 'assigned' })).toBe(true);
    expect(canReturnToSeller({ kind: 'replacement_delivery', status: 'unassigned' })).toBe(true);
    expect(canReturnToSeller({ kind: 'delivery', status: 'picked_up' })).toBe(false);
    expect(canReturnToSeller({ kind: 'delivery', status: 'in_transit' })).toBe(false);
    expect(canReturnToSeller({ kind: 'delivery', status: 'failed' })).toBe(false);
    expect(canReturnToSeller({ kind: 'delivery', status: 'unassigned', runId: 'r1' })).toBe(false);
    for (const kind of ['pickup', 'transfer', 'return_pickup', 'return_transfer', 'return_to_seller'] as const) expect(canReturnToSeller({ kind, status: 'unassigned' })).toBe(false);
  });
  it('does not blame a rider for a leg the system or staff closed', () => {
    for (const r of ['Returned to seller', 'Order cancelled', 'Seller cancelled', 'Parcel missing from run TR-0001.']) expect(isVoidedFailure(r)).toBe(true);
    for (const r of ['Customer not at home', null, undefined, '']) expect(isVoidedFailure(r)).toBe(false);
  });
});

describe('least busy rider', () => {
  const r = (id: string, name: string, open: number, recent = 0) => ({ id, name, open, recent });
  it('picks the rider with the fewest open tasks', () => {
    expect(pickLeastBusy([r('a', 'Ann', 3), r('b', 'Ben', 1), r('c', 'Cy', 2)])?.id).toBe('b');
  });
  it('breaks a tie by who was given fewer tasks lately, then by name, then by id', () => {
    expect(pickLeastBusy([r('a', 'Ann', 1, 5), r('b', 'Ben', 1, 2)])?.id).toBe('b');
    expect(pickLeastBusy([r('b', 'Ben', 1, 2), r('a', 'Ann', 1, 2)])?.id).toBe('a');
    expect(pickLeastBusy([r('z', 'Same', 0), r('y', 'Same', 0)])?.id).toBe('y');
  });
  it('is the same whatever order the riders come in', () => {
    const list = [r('a', 'Ann', 2, 1), r('b', 'Ben', 0, 9), r('c', 'Cy', 0, 4)];
    expect(pickLeastBusy(list)?.id).toBe('c');
    expect(pickLeastBusy([...list].reverse())?.id).toBe('c');
  });
  it('is null when there is nobody', () => {
    expect(pickLeastBusy([])).toBeNull();
  });
});
