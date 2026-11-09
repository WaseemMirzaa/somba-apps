import { createHash, timingSafeEqual } from 'crypto';

/**
 * RD-01 / A-13: the attempt limit on the customer's 4-digit delivery code.
 *
 * A rider who is not at the door must not be able to try every code until one works. Wrong codes are counted per task in
 * the database (`delivery_tasks.codeFailures`). Every {@link TRIES_PER_ROUND} wrong codes lock the code step for longer:
 *
 *   5 wrong  -> locked 15 minutes
 *   10 wrong -> locked 1 hour
 *   15 wrong -> locked until a warehouse supervisor (or an operations admin) unlocks it
 *
 * so a rider gets at most 15 guesses out of 9,000 codes (0.17 %) without a person at the warehouse deciding otherwise. A
 * correct code never counts as a failure and clears the counter.
 */
export const TRIES_PER_ROUND = 5;
/** Lock length (minutes) after the 5th and the 10th wrong code. The 15th wrong code needs a supervisor. */
export const LOCK_MINUTES: readonly number[] = [15, 60];
export const SUPERVISOR_AT = TRIES_PER_ROUND * (LOCK_MINUTES.length + 1);
/** From this many wrong codes on, the warehouse and the admins are told so someone can phone the customer. */
export const ALERT_FROM = 3;

/** What a wrong code number `failures` (1-based, counted since the last reset) does to the task. */
export interface CodeLock {
  /** The step is locked until this time; null when it needs a supervisor (no time limit). */
  until: Date | null;
  /** Locked until a supervisor unlocks it. */
  supervisor: boolean;
  /** The length of this lock in minutes (0 for a supervisor lock). */
  minutes: number;
}

/** The lock that wrong code number `failures` triggers, or null when it does not (yet) lock. */
export function lockAfter(failures: number, now: number): CodeLock | null {
  if (failures < TRIES_PER_ROUND || failures % TRIES_PER_ROUND !== 0) return null;
  if (failures >= SUPERVISOR_AT) return { until: null, supervisor: true, minutes: 0 };
  const minutes = LOCK_MINUTES[failures / TRIES_PER_ROUND - 1];
  return { until: new Date(now + minutes * 60_000), supervisor: false, minutes };
}

/** How many more wrong codes until the next lock (0 when locked for a supervisor). */
export function triesLeft(failures: number): number {
  if (failures >= SUPERVISOR_AT) return 0;
  return TRIES_PER_ROUND - (failures % TRIES_PER_ROUND);
}

type Stored = { codeFailures?: number | null; codeLockedUntil?: Date | string | null };

/** Is the code step locked right now? (`codeFailures` and `codeLockedUntil` as stored on the task.) */
export function isCodeLocked(t: Stored, now: number): boolean {
  if ((t.codeFailures ?? 0) >= SUPERVISOR_AT) return true;
  if (!t.codeLockedUntil) return false;
  return new Date(t.codeLockedUntil).getTime() > now;
}

/** The sentences the rider sees (English; the rider app and the web portal translate them, see their server-error lists). */
export const CODE_MESSAGES = {
  wrong: 'Wrong delivery code. Ask the customer for the 4-digit code shown in their app.',
  /** Fewer than three tries left: the rider is told so before the lock. */
  wrongLeft: (left: number) => `Wrong delivery code. Ask the customer for the 4-digit code shown in their app. ${left} ${left === 1 ? 'try' : 'tries'} left before this step locks.`,
  /** Locked for a while. `minutes` is what is left of the lock (rounded up). */
  locked: (minutes: number) =>
    `Too many wrong delivery codes. The code step is locked for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Ask the customer to confirm the code in their app, or call the warehouse.`,
  /** Locked until a supervisor unlocks it. */
  supervisor: 'Too many wrong delivery codes. The code step is locked until a warehouse supervisor unlocks it. Call the warehouse.',
  notAllowedToUnlock: 'Only a warehouse supervisor or an operations administrator can unlock a delivery code.',
  notLocked: 'This delivery code is not locked.',
} as const;

/** The message of a lock still running: minutes left, rounded up so it never says "0 minutes" while locked. */
export function lockedMessage(t: Stored, now: number): string {
  if ((t.codeFailures ?? 0) >= SUPERVISOR_AT || !t.codeLockedUntil) return CODE_MESSAGES.supervisor;
  const ms = new Date(t.codeLockedUntil).getTime() - now;
  return CODE_MESSAGES.locked(Math.max(1, Math.ceil(ms / 60_000)));
}

/** Constant-time comparison of the typed code with the real one (both hashed first so the lengths never differ). */
export function sameCode(typed: unknown, expected: string): boolean {
  const a = createHash('sha256').update(String(typed ?? '').trim()).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}
