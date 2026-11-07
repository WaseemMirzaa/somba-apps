import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { RiderShift, User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierAllows } from '../logistics/tiers';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/** A shift still open after this many hours is closed by the server (the rider forgot to clock out). */
export const MAX_SHIFT_HOURS = 16;
/** The history window: today and the 6 UTC days before it (the same "last 7 days" as the rider work stats). */
export const HISTORY_DAYS = 7;
/** Admin roles that read rider attendance (the Operations department owns fulfilment; warehouse supervisors do for their own warehouse). */
export const ATTENDANCE_ADMINS: readonly string[] = ['admin', 'admin_operations'];

export type ShiftStatus = 'off' | 'on' | 'break';

/** One shift as clients see it. Times are ISO strings on the wire; `breakMinutes` includes a break that is still running. */
export interface ShiftView {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  /** Minutes on break, a running break counted up to now. */
  breakMinutes: number;
  onBreak: boolean;
  breakStartedAt: Date | null;
  /** From start to end (or to now while open), minus the breaks. Never negative. */
  workedMinutes: number;
  endReason: 'rider' | 'auto' | null;
}

export interface AttendanceSummary {
  status: ShiftStatus;
  /** The open shift, if any. */
  current: ShiftView | null;
  /** The most recent shift that has ended (any age). */
  lastShift: ShiftView | null;
  /** Minutes worked over the last 7 UTC days (shifts counted by the day they started; an open one up to now). */
  minutesLast7Days: number;
  shiftsLast7Days: number;
  /** Shifts that started in the last 7 days, newest first. */
  shifts: ShiftView[];
  now: Date;
}

const whole = (ms: number): number => Math.max(0, Math.floor(ms / MIN_MS));

/** Pure: how a shift reads at `now`. */
export function shiftView(s: RiderShift, now: Date): ShiftView {
  const end = s.endedAt ?? now;
  const running = s.breakStartedAt && !s.endedAt ? whole(now.getTime() - s.breakStartedAt.getTime()) : 0;
  const breakMinutes = s.breakMinutes + running;
  return {
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    breakMinutes,
    onBreak: !!s.breakStartedAt && !s.endedAt,
    breakStartedAt: s.endedAt ? null : s.breakStartedAt ?? null,
    workedMinutes: Math.max(0, whole(end.getTime() - s.startedAt.getTime()) - breakMinutes),
    endReason: s.endReason ?? null,
  };
}

/**
 * A rider's shifts. The shift IS the rider's duty state: on shift while a row of theirs is open, on break while a break
 * runs inside it. (Main has no other on-duty flag: tasks are assigned by the warehouse desk whether or not a rider is
 * on shift, and GPS follows the delivery in transit, so nothing here competes with them.)
 *
 * Rules, all enforced here and, for the first, in the database too:
 *  - one open shift per rider (C-shift-one-open: unique `openRiderId`); clocking in while on shift is a no-op;
 *  - clocking out or ending a break that is not running is a no-op, never an error;
 *  - clocking out ends a running break first;
 *  - a shift open for more than {@link MAX_SHIFT_HOURS} is closed at start + that many hours, on the next read or action
 *    of that rider (there is no scheduler job in this codebase to do it earlier), with `endReason = 'auto'`;
 *  - a rider only ever reads and changes their own shifts; staff read a rider's attendance within their scope.
 * Every method takes `now` so the rules can be tested with a clock.
 */
@Injectable()
export class ShiftService {
  constructor(
    @InjectRepository(RiderShift) private readonly shifts: Repository<RiderShift>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  // ───────────────────────── rider actions ─────────────────────────

  /** Where the rider stands, with their last 7 days (closes a forgotten shift first). */
  async mine(riderId: string, now: Date = new Date()): Promise<AttendanceSummary> {
    const rider = await this.rider(riderId);
    await this.closeStale(rider.id, now);
    return this.summary(rider.id, now);
  }

  /** Clock in. Already on shift: the open shift is returned unchanged. */
  async clockIn(riderId: string, now: Date = new Date()): Promise<AttendanceSummary> {
    const rider = await this.rider(riderId);
    await this.closeStale(rider.id, now);
    let started = false;
    if (!(await this.open(rider.id))) {
      try {
        await this.shifts.save(this.shifts.create({ riderId: rider.id, openRiderId: rider.id, hubId: rider.hubId ?? null, startedAt: now, breakMinutes: 0 }));
        started = true;
      } catch (e) {
        // A second clock-in raced this one and won (the unique `openRiderId`): the rider is on shift, which is what they asked for.
        if (!(await this.open(rider.id))) throw e;
      }
    }
    return started ? this.publish(rider, now) : this.summary(rider.id, now);
  }

  /** Clock out (ends a running break first). Not on shift: nothing happens. */
  async clockOut(riderId: string, now: Date = new Date()): Promise<AttendanceSummary> {
    const rider = await this.rider(riderId);
    await this.closeStale(rider.id, now);
    const shift = await this.open(rider.id);
    if (shift && (await this.finish(shift, now, 'rider'))) return this.publish(rider, now);
    return this.summary(rider.id, now);
  }

  /** Start a break. Needs an open shift; a break already running is left as it is. */
  async startBreak(riderId: string, now: Date = new Date()): Promise<AttendanceSummary> {
    const rider = await this.rider(riderId);
    await this.closeStale(rider.id, now);
    const shift = await this.open(rider.id);
    if (!shift) throw new BadRequestException('Start your shift first.');
    if (shift.breakStartedAt) return this.summary(rider.id, now);
    const at = new Date(Math.max(now.getTime(), shift.startedAt.getTime()));
    const done = await this.shifts.update({ id: shift.id, endedAt: IsNull(), breakStartedAt: IsNull() }, { breakStartedAt: at });
    return done.affected ? this.publish(rider, now) : this.summary(rider.id, now);
  }

  /** End the break. No break running (or no shift): nothing happens. */
  async endBreak(riderId: string, now: Date = new Date()): Promise<AttendanceSummary> {
    const rider = await this.rider(riderId);
    await this.closeStale(rider.id, now);
    const shift = await this.open(rider.id);
    if (!shift?.breakStartedAt) return this.summary(rider.id, now);
    const taken = whole(Math.max(now.getTime(), shift.breakStartedAt.getTime()) - shift.breakStartedAt.getTime());
    const done = await this.shifts.update(
      { id: shift.id, endedAt: IsNull(), breakStartedAt: shift.breakStartedAt },
      { breakStartedAt: null, breakMinutes: shift.breakMinutes + taken },
    );
    return done.affected ? this.publish(rider, now) : this.summary(rider.id, now);
  }

  // ───────────────────────── staff read ─────────────────────────

  /**
   * A rider's attendance for the staff pages. Admins of Operations (and the Super Admin) read any rider; a warehouse
   * supervisor or manager only riders of their own warehouse; everyone else is refused.
   */
  async forStaff(actor: Actor, riderId: unknown, now: Date = new Date()): Promise<AttendanceSummary & { riderId: string; riderName: string }> {
    if (actor.role.startsWith('admin')) {
      if (!ATTENDANCE_ADMINS.includes(actor.role)) throw new BadRequestException('Not allowed.');
    } else if (actor.role !== 'warehouse_staff') {
      throw new BadRequestException('Staff only.');
    } else if (!tierAllows(actor.role, actor.tier, 'oversee')) {
      throw new BadRequestException('Only supervisors and managers can see rider attendance.');
    }
    const rider = await this.users.findOne({ where: { id: String(riderId ?? '') } });
    if (!rider || rider.role !== 'rider') throw new NotFoundException('Rider not found.');
    if (actor.hubId && rider.hubId !== actor.hubId) throw new BadRequestException('This rider belongs to another warehouse.');
    await this.closeStale(rider.id, now);
    return { riderId: rider.id, riderName: rider.name, ...(await this.summary(rider.id, now)) };
  }

  // ───────────────────────── internals ─────────────────────────

  private async rider(riderId: string): Promise<User> {
    const rider = await this.users.findOne({ where: { id: String(riderId ?? '') } });
    if (!rider || rider.role !== 'rider') throw new NotFoundException('Rider not found.');
    if (rider.active === false) throw new BadRequestException('Your account is switched off. Ask an administrator.');
    return rider;
  }

  private open(riderId: string): Promise<RiderShift | null> {
    return this.shifts.findOne({ where: { riderId, endedAt: IsNull() }, order: { startedAt: 'DESC' } });
  }

  /**
   * Close the rider's shift if it has been open longer than the limit: it ends at start + the limit (hours are never
   * inflated by a forgotten clock-out) and a break still running ends there too.
   */
  private async closeStale(riderId: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - MAX_SHIFT_HOURS * HOUR_MS);
    const stale = await this.shifts.find({ where: { riderId, endedAt: IsNull(), startedAt: LessThanOrEqual(cutoff) } });
    let closed = false;
    for (const s of stale) closed = (await this.finish(s, new Date(s.startedAt.getTime() + MAX_SHIFT_HOURS * HOUR_MS), 'auto')) || closed;
    if (closed) {
      const rider = await this.users.findOne({ where: { id: riderId } });
      if (rider) await this.publish(rider, now);
    }
  }

  /** Close a shift at `at`. Conditional on it still being open, so two closers cannot both count it. */
  private async finish(s: RiderShift, at: Date, reason: 'rider' | 'auto'): Promise<boolean> {
    const end = new Date(Math.max(at.getTime(), s.startedAt.getTime()));
    const tail = s.breakStartedAt ? whole(Math.max(end.getTime(), s.breakStartedAt.getTime()) - s.breakStartedAt.getTime()) : 0;
    const done = await this.shifts.update(
      { id: s.id, endedAt: IsNull() },
      { endedAt: end, endReason: reason, openRiderId: null, breakStartedAt: null, breakMinutes: s.breakMinutes + tail },
    );
    return !!done.affected;
  }

  private async summary(riderId: string, now: Date): Promise<AttendanceSummary> {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (HISTORY_DAYS - 1) * DAY_MS);
    const [recent, open, last] = await Promise.all([
      this.shifts.find({ where: { riderId, startedAt: MoreThanOrEqual(from) }, order: { startedAt: 'DESC' }, take: 100 }),
      this.open(riderId),
      this.shifts.findOne({ where: { riderId, endedAt: Not(IsNull()) }, order: { endedAt: 'DESC' } }),
    ]);
    const shifts = recent.map((s) => shiftView(s, now));
    const current = open ? shiftView(open, now) : null;
    return {
      status: !current ? 'off' : current.onBreak ? 'break' : 'on',
      current,
      lastShift: last ? shiftView(last, now) : null,
      minutesLast7Days: shifts.reduce((sum, s) => sum + s.workedMinutes, 0),
      shiftsLast7Days: shifts.length,
      shifts,
      now,
    };
  }

  /** The rider's new state to their own phones, and a small notice to staff who watch attendance. */
  private async publish(rider: User, now: Date): Promise<AttendanceSummary> {
    const sum = await this.summary(rider.id, now);
    this.emitter.toUser(rider.id, 'shift:updated', sum);
    const notice = { riderId: rider.id, status: sum.status, since: sum.current?.startedAt ?? null };
    if (rider.hubId) this.emitter.toHub(rider.hubId, 'attendance:updated', notice);
    this.emitter.toRoles([...ATTENDANCE_ADMINS], 'attendance:updated', notice);
    return sum;
  }
}
