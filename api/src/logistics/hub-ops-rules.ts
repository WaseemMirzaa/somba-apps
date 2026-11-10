import type { DeliveryKind } from '../database/entities';
import { num, oneOf, str } from '../common/validate';
import { CUSTOMER_KINDS } from './leg-rules';

/**
 * Warehouse operations rules as pure functions (no I/O): the settings and their validation, working hours, the aged-parcel
 * alert levels, and the auto-assignment choice. The services around them only read and write.
 *
 * Riders are salaried and the warehouse assigns every task: nothing here has a rider accept, refuse or switch
 * themselves on duty, and nothing measures pay.
 */

/** What one warehouse's floor runs on (the columns of `hub_ops_settings` that clients see and edit). */
export interface HubOps {
  workStart: string;
  workEnd: string;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  workDays: number[];
  timezone: string;
  batchSize: number;
  autoAssign: boolean;
  autoAssignRule: AutoAssignRule;
  /** Ages in hours of alert levels 1, 2, 3 (strictly increasing; 3 is the last and escalates). */
  agedLevels: [number, number, number];
  deliveryTargetHours: number;
}

export const AUTO_ASSIGN_RULES = ['least_busy'] as const;
export type AutoAssignRule = (typeof AUTO_ASSIGN_RULES)[number];

/** Used for a warehouse that has not saved settings. Auto-assignment is off until a manager switches it on. */
export const DEFAULT_HUB_OPS: HubOps = {
  workStart: '08:00',
  workEnd: '18:00',
  workDays: [1, 2, 3, 4, 5, 6],
  timezone: 'Africa/Kinshasa',
  batchSize: 20,
  autoAssign: false,
  autoAssignRule: 'least_busy',
  agedLevels: [24, 48, 72],
  deliveryTargetHours: 24,
};

export const BATCH_SIZE_MAX = 200;
export const AGED_HOURS_MAX = 720;
export const TARGET_HOURS_MAX = 240;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight of an "HH:MM" string (validated elsewhere). */
export const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

export function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function time(v: unknown, label: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!HHMM.test(s)) throw new Error(`${label} must be a time like 08:00.`);
  return s;
}

function days(v: unknown): number[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!raw) throw new Error('Working days must be a list of weekdays (1 = Monday to 7 = Sunday).');
  const list = raw.map((x) => (typeof x === 'string' ? x.trim() : x)).map(Number);
  if (list.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new Error('Working days must be weekdays from 1 (Monday) to 7 (Sunday).');
  const set = [...new Set(list)].sort((a, b) => a - b);
  if (!set.length) throw new Error('Choose at least one working day.');
  return set;
}

/** The fields a manager or admin may send; anything else is ignored. */
export const EDITABLE_HUB_OPS = ['workStart', 'workEnd', 'workDays', 'timezone', 'batchSize', 'autoAssign', 'autoAssignRule', 'agedLevels', 'deliveryTargetHours'] as const;

/**
 * Merge a patch onto the current settings and validate the RESULT (so changing one age cannot leave the three out of
 * order). Throws an Error with a message safe to show.
 */
export function mergeHubOps(current: HubOps, patch: unknown): HubOps {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const has = (k: string) => p[k] !== undefined;
  const next: HubOps = { ...current, agedLevels: [...current.agedLevels] as HubOps['agedLevels'], workDays: [...current.workDays] };
  if (has('workStart')) next.workStart = time(p.workStart, 'Opening time');
  if (has('workEnd')) next.workEnd = time(p.workEnd, 'Closing time');
  if (has('workDays')) next.workDays = days(p.workDays);
  if (has('timezone')) {
    next.timezone = str(p.timezone, 'Time zone', { max: 64 });
    if (!isTimezone(next.timezone)) throw new Error('Choose a valid time zone, for example Africa/Kinshasa.');
  }
  if (has('batchSize')) next.batchSize = num(p.batchSize, 'Batch size', { min: 1, max: BATCH_SIZE_MAX, int: true });
  if (has('autoAssign')) {
    if (typeof p.autoAssign !== 'boolean') throw new Error('Auto-assignment must be on or off.');
    next.autoAssign = p.autoAssign;
  }
  if (has('autoAssignRule')) next.autoAssignRule = oneOf(p.autoAssignRule, AUTO_ASSIGN_RULES, 'Auto-assignment rule');
  if (has('agedLevels')) {
    const a = p.agedLevels;
    if (!Array.isArray(a) || a.length !== 3) throw new Error('Give the three ages (in hours) for alert levels 1, 2 and 3.');
    next.agedLevels = a.map((x, i) => num(x, `Alert level ${i + 1} age`, { min: 1, max: AGED_HOURS_MAX, int: true })) as HubOps['agedLevels'];
  }
  if (has('deliveryTargetHours')) next.deliveryTargetHours = num(p.deliveryTargetHours, 'Delivery-time target', { min: 1, max: TARGET_HOURS_MAX });
  if (!(minutesOf(next.workStart) < minutesOf(next.workEnd))) throw new Error('Closing time must be after opening time.');
  const [a, b, c] = next.agedLevels;
  if (!(a < b && b < c)) throw new Error('The alert ages must increase: level 1 < level 2 < level 3.');
  return next;
}

/** The local weekday (ISO 1..7) and minutes since midnight of an instant in a time zone. */
export function localClock(at: Date, timezone: string): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_HUB_OPS.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  }
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[get('weekday')] ?? 1;
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Is the warehouse open at this instant: a working day, from opening (inclusive) to closing (exclusive)? */
export function isWorkingNow(ops: Pick<HubOps, 'workStart' | 'workEnd' | 'workDays' | 'timezone'>, at: Date = new Date()): boolean {
  const { weekday, minutes } = localClock(at, ops.timezone);
  return ops.workDays.includes(weekday) && minutes >= minutesOf(ops.workStart) && minutes < minutesOf(ops.workEnd);
}

/**
 * The first moment at or after `at` when the warehouse is open (`at` itself while it is open): today at opening time when it has not
 * opened yet, else the opening time of the next working day. Used to count an express order's days from when a rider can start.
 */
export function nextWorkingMoment(ops: Pick<HubOps, 'workStart' | 'workEnd' | 'workDays' | 'timezone'>, at: Date = new Date()): Date {
  if (isWorkingNow(ops, at)) return at;
  const { weekday, minutes } = localClock(at, ops.timezone);
  const start = minutesOf(ops.workStart);
  for (let d = 0; d <= 7; d++) {
    const day = ((weekday - 1 + d) % 7) + 1;
    if (!ops.workDays.includes(day)) continue;
    if (d === 0 && minutes >= start) continue; // already closed for today
    return new Date(at.getTime() + d * 86_400_000 + (start - minutes) * 60_000);
  }
  return at;
}

// ── aged parcels ─────────────────────────────────────────────────────────────

/** Hours an open leg has waited. */
export const ageHours = (createdAt: Date, now: Date = new Date()): number => Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);

/**
 * When a leg's age starts. An express leg is created with the order but cannot be collected until the seller packs it, so its
 * alerts count from `readyAt` (else from creation); every other leg counts from creation.
 */
export const ageStart = (t: { kind: DeliveryKind; createdAt: Date; readyAt?: Date | null }): Date => (t.kind === 'express' && t.readyAt ? t.readyAt : t.createdAt);

/** The alert levels (1..3) a leg of this age has reached. */
export function dueLevels(age: number, levels: readonly number[]): number[] {
  return levels.map((h, i) => (age >= h ? i + 1 : 0)).filter((l) => l > 0);
}

/** The level a leg of this age is at (0 = not aged yet). */
export const levelOf = (age: number, levels: readonly number[]): number => dueLevels(age, levels).length;

export const LAST_LEVEL = 3;

/**
 * What a "return to seller" may be made from: the customer-bound leg, while the parcel is still at the warehouse (no rider
 * has collected it yet). Anything else is on the road, belongs to another leg, or is already a way back.
 */
// `express` is not returnable: its parcel is still with the seller (or in the rider's hands), never waiting at a warehouse.
export const RETURNABLE_KINDS: readonly DeliveryKind[] = ['delivery', 'replacement_delivery'];
export const EXPRESS_NOT_RETURNABLE = 'An express parcel is still with the seller. Cancel the order instead.';
export const RETURNABLE_STATUSES = ['unassigned', 'assigned'] as const;
export function canReturnToSeller(t: { kind: DeliveryKind; status: string; runId?: string | null }): boolean {
  return RETURNABLE_KINDS.includes(t.kind) && (RETURNABLE_STATUSES as readonly string[]).includes(t.status) && !t.runId;
}

/** Why a task is closed when the order, the seller or a return-to-seller voided it (not the rider's doing). */
export const RETURN_TO_SELLER_REASON = 'Returned to seller';
export const VOID_REASONS = ['Order cancelled', 'Seller cancelled', RETURN_TO_SELLER_REASON];
/** A failed task the rider is not answerable for: voided by the system, a staff decision or an exception. */
export const isVoidedFailure = (failureReason: string | null | undefined): boolean =>
  !!failureReason && (VOID_REASONS.includes(failureReason) || /^Parcel missing from run /.test(failureReason) || /cancel/i.test(failureReason));

// ── auto-assignment ──────────────────────────────────────────────────────────

/** A rider as the auto-assignment sees them. */
export interface Candidate {
  id: string;
  name: string;
  /** Tasks the rider is working on now (assigned, picked up, in transit). */
  open: number;
  /** Tasks given to the rider in the last 24 hours (any status): the tie-break, so work rotates. */
  recent: number;
}

/**
 * The rule `least_busy`: the rider with the fewest open tasks; ties go to whoever was given fewer tasks lately, then to the
 * name and id so the choice is the same every time. Null when there is nobody to give it to.
 */
export function pickLeastBusy(riders: readonly Candidate[]): Candidate | null {
  if (!riders.length) return null;
  return [...riders].sort((a, b) => a.open - b.open || a.recent - b.recent || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];
}

/** Legs auto-assignment handles: the ones a supervisor would assign by hand. Transfers are planned into runs instead. */
export const AUTO_ASSIGN_KINDS: readonly DeliveryKind[] = ['pickup', ...CUSTOMER_KINDS, 'return_pickup', 'return_to_seller', 'replacement_delivery'];
