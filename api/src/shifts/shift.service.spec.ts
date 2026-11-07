import { DataSource } from 'typeorm';
import { ENTITIES, Hub, RiderShift, User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { recordingEmitter } from '../testing/test-db';
import { ATTENDANCE_ADMINS, MAX_SHIFT_HOURS, ShiftService, shiftView } from './shift.service';

/**
 * Rider shifts: clock in / out, breaks, the one-open-shift rule (also in the database), the 16-hour auto-close, what a
 * rider sees (only their own) and what staff may read (role, tier, warehouse). Real service over in-memory SQLite.
 */
describe('rider shifts and attendance', () => {
  let ds: DataSource;
  let emitter: ReturnType<typeof recordingEmitter>;
  let svc: ShiftService;
  let gombe: Hub;
  let limete: Hub;
  let rider: User;
  let other: User;
  let seq = 0;

  const T0 = new Date('2026-03-10T08:00:00.000Z');
  const at = (minutes: number, base: Date = T0) => new Date(base.getTime() + minutes * 60_000);
  const hours = (h: number) => at(h * 60);

  const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa', lat: -4.3, lng: 15.3 }));
  const mkUser = (role: User['role'], hubId: string | null, name: string, over: Partial<User> = {}) => {
    const n = ++seq;
    return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name, role, hubId, ...over }));
  };
  const rows = (riderId = rider.id) => ds.getRepository(RiderShift).find({ where: { riderId }, order: { startedAt: 'ASC' } });
  const staff = (tier: 'operator' | 'supervisor' | 'manager', hub: Hub): Actor => ({ id: `s-${tier}`, role: 'warehouse_staff', name: tier, hubId: hub.id, tier });
  const admin = (role = 'admin'): Actor => ({ id: 'a1', role, name: 'Admin', hubId: null, tier: null });

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    emitter = recordingEmitter();
    svc = new ShiftService(ds.getRepository(RiderShift), ds.getRepository(User), emitter as never);
    gombe = await mkHub('Gombe');
    limete = await mkHub('Limete');
    rider = await mkUser('rider', gombe.id, 'Rider One');
    other = await mkUser('rider', limete.id, 'Rider Two');
  });
  afterEach(async () => ds.destroy());

  describe('clock in and out', () => {
    it('starts a shift: on shift, the start time kept, the warehouse remembered', async () => {
      const s = await svc.clockIn(rider.id, T0);
      expect(s.status).toBe('on');
      expect(s.current).toMatchObject({ startedAt: T0, endedAt: null, breakMinutes: 0, onBreak: false, workedMinutes: 0 });
      const [row] = await rows();
      expect(row).toMatchObject({ riderId: rider.id, hubId: gombe.id, openRiderId: rider.id, endedAt: null });
      expect(row.startedAt.getTime()).toBe(T0.getTime());
    });

    it('clocking in twice is a no-op: one open shift, the first start time, no second event', async () => {
      await svc.clockIn(rider.id, T0);
      const again = await svc.clockIn(rider.id, at(30));
      expect(again.status).toBe('on');
      expect(again.current!.startedAt).toEqual(T0);
      expect(await rows()).toHaveLength(1);
      expect(emitter.sent.filter((e) => e.event === 'shift:updated')).toHaveLength(1);
    });

    it('clocks out: the end time and the worked minutes are kept, the rider is off shift', async () => {
      await svc.clockIn(rider.id, T0);
      const s = await svc.clockOut(rider.id, at(8 * 60 + 5));
      expect(s.status).toBe('off');
      expect(s.current).toBeNull();
      expect(s.lastShift).toMatchObject({ workedMinutes: 8 * 60 + 5, endReason: 'rider' });
      const [row] = await rows();
      expect(row.openRiderId).toBeNull();
      expect(row.endedAt!.getTime()).toBe(at(8 * 60 + 5).getTime());
    });

    it('clocking out twice (or never having clocked in) is a no-op, not an error', async () => {
      expect((await svc.clockOut(rider.id, T0)).status).toBe('off');
      expect(await rows()).toHaveLength(0);
      await svc.clockIn(rider.id, T0);
      await svc.clockOut(rider.id, at(60));
      const sent = emitter.sent.length;
      const second = await svc.clockOut(rider.id, at(90));
      expect(second.status).toBe('off');
      expect(second.lastShift!.workedMinutes).toBe(60);
      expect((await rows())[0].endedAt!.getTime()).toBe(at(60).getTime());
      expect(emitter.sent).toHaveLength(sent);
    });

    it('a new shift can start after the last one ended', async () => {
      await svc.clockIn(rider.id, T0);
      await svc.clockOut(rider.id, at(120));
      const s = await svc.clockIn(rider.id, at(240));
      expect(s.status).toBe('on');
      expect(await rows()).toHaveLength(2);
      expect(s.shifts).toHaveLength(2);
    });

    it('C-shift-one-open: the database itself refuses a second open shift for a rider', async () => {
      await svc.clockIn(rider.id, T0);
      const repo = ds.getRepository(RiderShift);
      await expect(repo.save(repo.create({ riderId: rider.id, openRiderId: rider.id, startedAt: at(5) }))).rejects.toThrow(/UNIQUE|unique/i);
      // closed shifts (openRiderId NULL) are not limited
      await repo.save(repo.create({ riderId: rider.id, openRiderId: null, startedAt: at(-600), endedAt: at(-500) }));
      await repo.save(repo.create({ riderId: rider.id, openRiderId: null, startedAt: at(-400), endedAt: at(-300) }));
      expect(await repo.count({ where: { riderId: rider.id } })).toBe(3);
    });

    it('two clock-ins at the same moment leave exactly one open shift', async () => {
      const [a, b] = await Promise.all([svc.clockIn(rider.id, T0), svc.clockIn(rider.id, T0)]);
      expect([a.status, b.status]).toEqual(['on', 'on']);
      expect(await rows()).toHaveLength(1);
    });

    it('refuses an account that is not a rider, one that does not exist, and a switched-off rider', async () => {
      const customer = await mkUser('customer', null, 'Cust');
      await expect(svc.clockIn(customer.id, T0)).rejects.toThrow('Rider not found.');
      await expect(svc.clockIn('nope', T0)).rejects.toThrow('Rider not found.');
      const off = await mkUser('rider', gombe.id, 'Off Rider', { active: false });
      await expect(svc.clockIn(off.id, T0)).rejects.toThrow('Your account is switched off');
      expect(await ds.getRepository(RiderShift).count()).toBe(0);
    });
  });

  describe('breaks', () => {
    it('a break needs a shift', async () => {
      await expect(svc.startBreak(rider.id, T0)).rejects.toThrow('Start your shift first.');
    });

    it('start and end a break: on break while it runs, the minutes added when it ends', async () => {
      await svc.clockIn(rider.id, T0);
      const during = await svc.startBreak(rider.id, at(120));
      expect(during.status).toBe('break');
      expect(during.current).toMatchObject({ onBreak: true, breakMinutes: 0 });
      // the running break shows up in the figures as it goes
      const later = await svc.mine(rider.id, at(135));
      expect(later.current).toMatchObject({ onBreak: true, breakMinutes: 15, workedMinutes: 135 - 15 });
      const after = await svc.endBreak(rider.id, at(145));
      expect(after.status).toBe('on');
      expect(after.current).toMatchObject({ onBreak: false, breakMinutes: 25, workedMinutes: 145 - 25 });
    });

    it('breaks add up over the shift', async () => {
      await svc.clockIn(rider.id, T0);
      await svc.startBreak(rider.id, at(60));
      await svc.endBreak(rider.id, at(90));
      await svc.startBreak(rider.id, at(180));
      await svc.endBreak(rider.id, at(200));
      const out = await svc.clockOut(rider.id, at(300));
      expect(out.lastShift).toMatchObject({ breakMinutes: 50, workedMinutes: 250 });
    });

    it('starting a break twice, or ending one that is not running, changes nothing', async () => {
      await svc.clockIn(rider.id, T0);
      expect((await svc.endBreak(rider.id, at(10))).status).toBe('on');
      await svc.startBreak(rider.id, at(20));
      const sent = emitter.sent.length;
      const again = await svc.startBreak(rider.id, at(25));
      expect(again.status).toBe('break');
      expect((await rows())[0].breakStartedAt!.getTime()).toBe(at(20).getTime());
      await svc.endBreak(rider.id, at(30));
      const sent2 = emitter.sent.length;
      expect((await svc.endBreak(rider.id, at(40))).current!.breakMinutes).toBe(10);
      expect(emitter.sent).toHaveLength(sent2);
      expect(sent2).toBeGreaterThan(sent);
    });

    it('ending the break with no shift is a no-op', async () => {
      expect((await svc.endBreak(rider.id, T0)).status).toBe('off');
    });

    it('clocking out during a break ends the break first', async () => {
      await svc.clockIn(rider.id, T0);
      await svc.startBreak(rider.id, at(100));
      const out = await svc.clockOut(rider.id, at(130));
      expect(out.status).toBe('off');
      expect(out.lastShift).toMatchObject({ breakMinutes: 30, workedMinutes: 100, onBreak: false });
      const [row] = await rows();
      expect(row.breakStartedAt).toBeNull();
    });
  });

  describe('a shift left open', () => {
    it('is closed on the next read at start + 16 hours, flagged auto, with no inflated hours', async () => {
      await svc.clockIn(rider.id, T0);
      const s = await svc.mine(rider.id, hours(30));
      expect(s.status).toBe('off');
      expect(s.lastShift).toMatchObject({ endReason: 'auto', workedMinutes: MAX_SHIFT_HOURS * 60 });
      const [row] = await rows();
      expect(row.endedAt!.getTime()).toBe(hours(MAX_SHIFT_HOURS).getTime());
      expect(row.openRiderId).toBeNull();
    });

    it('stays open just under the limit and closes at the limit', async () => {
      await svc.clockIn(rider.id, T0);
      expect((await svc.mine(rider.id, at(MAX_SHIFT_HOURS * 60 - 1))).status).toBe('on');
      expect((await svc.mine(rider.id, at(MAX_SHIFT_HOURS * 60))).status).toBe('off');
    });

    it('a break still running when the shift is closed ends there and counts as break time', async () => {
      await svc.clockIn(rider.id, T0);
      await svc.startBreak(rider.id, hours(15));
      const s = await svc.mine(rider.id, hours(20));
      expect(s.lastShift).toMatchObject({ endReason: 'auto', breakMinutes: 60, workedMinutes: 15 * 60 });
    });

    it('lets the rider clock in again straight away, whichever action they take first', async () => {
      await svc.clockIn(rider.id, T0);
      const s = await svc.clockIn(rider.id, hours(20));
      expect(s.status).toBe('on');
      expect(s.current!.startedAt).toEqual(hours(20));
      expect((await rows()).map((r) => r.endReason)).toEqual(['auto', null]);
    });

    it('is also closed when staff read the rider, so "currently on shift" is never stale', async () => {
      await svc.clockIn(rider.id, T0);
      const v = await svc.forStaff(admin(), rider.id, hours(40));
      expect(v.status).toBe('off');
      expect(v.lastShift!.endReason).toBe('auto');
    });

    it('tells the rider, their warehouse and the attendance admins', async () => {
      await svc.clockIn(rider.id, T0);
      emitter.sent.length = 0;
      await svc.mine(rider.id, hours(20));
      expect(emitter.sent.map((e) => e.event)).toEqual(['shift:updated', 'attendance:updated', 'attendance:updated']);
    });
  });

  describe('what the rider sees', () => {
    it('only their own shifts, never another rider’s', async () => {
      await svc.clockIn(rider.id, T0);
      await svc.clockIn(other.id, at(10));
      const mine = await svc.mine(rider.id, at(60));
      const theirs = await svc.mine(other.id, at(60));
      expect(mine.shifts).toHaveLength(1);
      expect(mine.current!.startedAt).toEqual(T0);
      expect(theirs.current!.startedAt).toEqual(at(10));
      await svc.clockOut(other.id, at(70));
      expect((await svc.mine(rider.id, at(80))).status).toBe('on');
    });

    it('the last 7 days: in/out, hours, newest first, older shifts left out but still the "last shift"', async () => {
      const repo = ds.getRepository(RiderShift);
      const day = (d: number, h: number) => new Date(Date.UTC(2026, 2, 10 - d, h, 0, 0));
      const mk = (d: number, start: number, end: number, extra: Partial<RiderShift> = {}) =>
        repo.save(repo.create({ riderId: rider.id, openRiderId: null, startedAt: day(d, start), endedAt: day(d, end), endReason: 'rider', ...extra }));
      await mk(1, 8, 17, { breakMinutes: 60 }); // 8 h worked
      await mk(3, 9, 12); // 3 h
      await mk(6, 8, 16); // 8 h: still inside the window (today + 6 days before)
      await mk(7, 8, 16); // outside the window
      await mk(20, 8, 12);
      const s = await svc.mine(rider.id, at(8 * 60 + 5 - 8 * 60 + 60, day(0, 8))); // 09:05 on the 10th
      expect(s.shifts.map((x) => x.workedMinutes)).toEqual([8 * 60, 3 * 60, 8 * 60]);
      expect(s.minutesLast7Days).toBe(19 * 60);
      expect(s.shiftsLast7Days).toBe(3);
      expect(s.lastShift!.startedAt).toEqual(day(1, 8));
      expect(s.status).toBe('off');
    });

    it('the open shift is in the list and counts up to now', async () => {
      await svc.clockIn(rider.id, T0);
      const s = await svc.mine(rider.id, at(90));
      expect(s.shifts).toHaveLength(1);
      expect(s.minutesLast7Days).toBe(90);
    });

    it('shiftView never goes negative, even for a clock that ran backwards', () => {
      const row = { id: 'x', riderId: 'r', startedAt: at(10), endedAt: null, breakMinutes: 0, breakStartedAt: null, endReason: null } as RiderShift;
      expect(shiftView(row, T0).workedMinutes).toBe(0);
    });
  });

  describe('what staff see', () => {
    beforeEach(async () => {
      await svc.clockIn(rider.id, T0);
      await svc.clockOut(rider.id, at(240));
      await svc.clockIn(rider.id, at(300));
    });

    it('a supervisor or manager of the rider’s warehouse sees currently on shift, the last shift and the hours', async () => {
      for (const tier of ['supervisor', 'manager'] as const) {
        const v = await svc.forStaff(staff(tier, gombe), rider.id, at(330));
        expect(v).toMatchObject({ riderId: rider.id, riderName: 'Rider One', status: 'on', minutesLast7Days: 240 + 30 });
        expect(v.lastShift).toMatchObject({ workedMinutes: 240 });
        expect(v.current!.startedAt).toEqual(at(300));
      }
    });

    it('an operator is refused', async () => {
      await expect(svc.forStaff(staff('operator', gombe), rider.id, at(330))).rejects.toThrow('Only supervisors and managers');
    });

    it('a supervisor of another warehouse is refused', async () => {
      await expect(svc.forStaff(staff('manager', limete), rider.id, at(330))).rejects.toThrow('This rider belongs to another warehouse.');
    });

    it('the Super Admin and Operations read any warehouse; the other admin roles are refused', async () => {
      for (const role of ATTENDANCE_ADMINS) {
        expect((await svc.forStaff(admin(role), rider.id, at(330))).status).toBe('on');
        expect((await svc.forStaff(admin(role), other.id, at(330))).status).toBe('off');
      }
      for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation']) {
        await expect(svc.forStaff(admin(role), rider.id, at(330))).rejects.toThrow('Not allowed.');
      }
    });

    it('riders, customers and sellers are refused', async () => {
      for (const role of ['rider', 'customer', 'seller']) {
        await expect(svc.forStaff({ id: 'u', role, name: 'x' }, rider.id, at(330))).rejects.toThrow('Staff only.');
      }
    });

    it('an unknown id, or an account that is not a rider, is "not found"', async () => {
      const sup = await mkUser('warehouse_staff', gombe.id, 'Sup');
      await expect(svc.forStaff(admin(), 'nope', at(330))).rejects.toThrow('Rider not found.');
      await expect(svc.forStaff(admin(), sup.id, at(330))).rejects.toThrow('Rider not found.');
      await expect(svc.forStaff(admin(), undefined, at(330))).rejects.toThrow('Rider not found.');
    });
  });

  describe('live updates', () => {
    it('a change reaches the rider’s phone with the full state, and staff with a small notice only', async () => {
      await svc.clockIn(rider.id, T0);
      const toRider = emitter.sent.find((e) => e.event === 'shift:updated')!;
      expect(toRider.to).toBe(`user:${rider.id}`);
      expect(toRider.payload.status).toBe('on');
      const toHub = emitter.sent.find((e) => e.to === `hub:${gombe.id}`)!;
      expect(toHub).toMatchObject({ event: 'attendance:updated', payload: { riderId: rider.id, status: 'on' } });
      expect(Object.keys(toHub.payload).sort()).toEqual(['riderId', 'since', 'status']);
      expect(emitter.sent.find((e) => e.to === ATTENDANCE_ADMINS.join(','))).toBeDefined();
      expect(emitter.sent.some((e) => e.to === `hub:${limete.id}`)).toBe(false);
    });
  });
});
