/**
 * The rider's delivery-code lock, as the warehouse desk shows it (RD-01, `api/src/delivery/delivery-code-lock.ts`).
 * Pure helpers with no imports so a node test can load them: who may unlock (mirrors `resetCodeLock` in
 * `api/src/delivery/delivery.service.ts`: the super admin, operations admins and warehouse staff of the supervisor tier or
 * above; the server is the guard) and the sentence for the status badge.
 */

/** The lock fields the server adds to every task view (`TaskView`). */
export interface CodeLockFields {
  codeFailures?: number | null;
  codeLocked?: boolean | null;
  /** When the timed lock ends; null while locked means "until a supervisor unlocks it". */
  codeLockedUntil?: string | null;
}

const ADMIN_UNLOCKERS = ["admin", "admin_operations"];

/** May this signed-in user unlock a delivery code? Operators, other admin roles, sellers and riders may not. */
export function canUnlockDeliveryCode(role: string | null | undefined, tier: string | null | undefined): boolean {
  if (ADMIN_UNLOCKERS.includes(role ?? "")) return true;
  return role === "warehouse_staff" && (tier === "supervisor" || tier === "manager");
}

/** Is the code step locked right now? A timed lock that has run out no longer counts, even if the view is older than that. */
export function isDeliveryCodeLocked(t: CodeLockFields, now: number = Date.now()): boolean {
  if (!t.codeLocked) return false;
  if (!t.codeLockedUntil) return true;
  const until = new Date(t.codeLockedUntil).getTime();
  return Number.isNaN(until) ? true : until > now;
}

/** When a timed lock ends, in ms (null for a lock that needs a supervisor, or no lock). */
export function codeLockEndsAt(t: CodeLockFields, now: number = Date.now()): number | null {
  if (!isDeliveryCodeLocked(t, now) || !t.codeLockedUntil) return null;
  const until = new Date(t.codeLockedUntil).getTime();
  return Number.isNaN(until) ? null : until;
}

/** HH:MM in the viewer's time zone, 24 hours. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The badge text of a locked task, or null when it is not locked. */
export function codeLockLabel(t: CodeLockFields, fr: boolean, now: number = Date.now()): string | null {
  if (!isDeliveryCodeLocked(t, now)) return null;
  const time = t.codeLockedUntil ? clockTime(t.codeLockedUntil) : "";
  if (time) return fr ? `Code verrouillé jusqu'à ${time}` : `Code locked until ${time}`;
  return fr ? "Code verrouillé jusqu'à son déverrouillage par un superviseur" : "Code locked until a supervisor unlocks it";
}

/** Show the "Unlock code" button: the user may use it and the task is locked right now. */
export function showUnlockCode(t: CodeLockFields, role: string | null | undefined, tier: string | null | undefined, now: number = Date.now()): boolean {
  return canUnlockDeliveryCode(role, tier) && isDeliveryCodeLocked(t, now);
}
