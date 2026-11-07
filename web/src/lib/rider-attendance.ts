/**
 * Rider attendance on the staff rider pages (`attendance:rider`, docs/contracts/rider-shift.md). Pure helpers: no imports,
 * so `npm test` loads this file on its own.
 */

export type ShiftStatus = "off" | "on" | "break";

export interface ShiftRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  onBreak: boolean;
  workedMinutes: number;
  endReason: "rider" | "auto" | null;
}

export interface Attendance {
  riderId: string;
  riderName: string;
  status: ShiftStatus;
  current: ShiftRow | null;
  lastShift: ShiftRow | null;
  /** Minutes worked over the last 7 UTC days (an open shift counted up to now). */
  minutesLast7Days: number;
  shiftsLast7Days: number;
  shifts: ShiftRow[];
}

/** "37 h 20 min" / "45 min" / "—" (nothing known). */
export function formatWorked(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return `${h} h ${String(r).padStart(2, "0")} min`;
}

const LABELS: Record<ShiftStatus, { en: string; fr: string }> = {
  on: { en: "On shift", fr: "En service" },
  break: { en: "On break", fr: "En pause" },
  off: { en: "Off shift", fr: "Hors service" },
};

export function statusLabel(status: ShiftStatus, fr: boolean): string {
  const l = LABELS[status] ?? LABELS.off;
  return fr ? l.fr : l.en;
}

/** Badge colour: on shift = success, on break = warning, off = neutral. */
export function statusVariant(status: ShiftStatus): "success" | "warning" | "default" {
  return status === "on" ? "success" : status === "break" ? "warning" : "default";
}

/** The staff pages may show attendance only to the roles the API serves (it is the guard; this only saves a refused call). */
export function mayReadAttendance(role: string | null | undefined): boolean {
  return role === "admin" || role === "admin_operations" || role === "warehouse_staff";
}
