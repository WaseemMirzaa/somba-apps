/**
 * Pure helpers for the warehouse operations screens (settings, aged parcels, analytics). No imports, so the tests load this file
 * as is. The server validates everything again: these only give the manager quick feedback and shape what is sent.
 */

export type AutoAssignRule = "least_busy";

/** The settings as `hubSettings:get` returns them. */
export interface HubOpsSettings {
  hubId: string;
  workStart: string;
  workEnd: string;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  workDays: number[];
  timezone: string;
  batchSize: number;
  autoAssign: boolean;
  autoAssignRule: AutoAssignRule;
  agedLevels: [number, number, number];
  deliveryTargetHours: number;
  isDefault: boolean;
  openNow: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  canEdit: boolean;
}

/** What the form edits: every field as text, so a half-typed number is not lost. */
export interface HubOpsForm {
  workStart: string;
  workEnd: string;
  workDays: number[];
  timezone: string;
  batchSize: string;
  autoAssign: boolean;
  agedLevels: [string, string, string];
  deliveryTargetHours: string;
}

export const WEEKDAYS: { id: number; en: string; fr: string }[] = [
  { id: 1, en: "Mon", fr: "Lun" },
  { id: 2, en: "Tue", fr: "Mar" },
  { id: 3, en: "Wed", fr: "Mer" },
  { id: 4, en: "Thu", fr: "Jeu" },
  { id: 5, en: "Fri", fr: "Ven" },
  { id: 6, en: "Sat", fr: "Sam" },
  { id: 7, en: "Sun", fr: "Dim" },
];

export const COMMON_TIMEZONES = ["Africa/Kinshasa", "Africa/Lubumbashi", "Africa/Brazzaville", "Africa/Nairobi", "Europe/Paris", "UTC"];

export function settingsToForm(s: Pick<HubOpsSettings, "workStart" | "workEnd" | "workDays" | "timezone" | "batchSize" | "autoAssign" | "agedLevels" | "deliveryTargetHours">): HubOpsForm {
  return {
    workStart: s.workStart,
    workEnd: s.workEnd,
    workDays: [...s.workDays],
    timezone: s.timezone,
    batchSize: String(s.batchSize),
    autoAssign: s.autoAssign,
    agedLevels: [String(s.agedLevels[0]), String(s.agedLevels[1]), String(s.agedLevels[2])],
    deliveryTargetHours: String(s.deliveryTargetHours),
  };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

/** A form problem in the user's language, or null when the form can be sent. Mirrors the server's rules. */
export function formProblem(f: HubOpsForm, fr: boolean): string | null {
  if (!HHMM.test(f.workStart) || !HHMM.test(f.workEnd)) return fr ? "Saisissez des heures valides, par exemple 08:00." : "Enter valid times, for example 08:00.";
  if (minutes(f.workStart) >= minutes(f.workEnd)) return fr ? "L'heure de fermeture doit être après l'heure d'ouverture." : "Closing time must be after opening time.";
  if (f.workDays.length === 0) return fr ? "Choisissez au moins un jour de travail." : "Choose at least one working day.";
  if (!f.timezone.trim()) return fr ? "Indiquez un fuseau horaire, par exemple Africa/Kinshasa." : "Enter a time zone, for example Africa/Kinshasa.";
  const batch = whole(f.batchSize);
  if (!(batch >= 1 && batch <= 200)) return fr ? "La taille d'un lot doit être un nombre entier entre 1 et 200." : "Batch size must be a whole number between 1 and 200.";
  const ages = f.agedLevels.map(whole);
  if (ages.some((a) => !(a >= 1 && a <= 720))) return fr ? "Chaque seuil d'alerte doit être un nombre entier d'heures entre 1 et 720." : "Each alert age must be a whole number of hours between 1 and 720.";
  if (!(ages[0] < ages[1] && ages[1] < ages[2])) return fr ? "Les seuils doivent augmenter : niveau 1 < niveau 2 < niveau 3." : "The alert ages must increase: level 1 < level 2 < level 3.";
  const target = Number(f.deliveryTargetHours.trim().replace(",", "."));
  if (!f.deliveryTargetHours.trim() || !Number.isFinite(target) || target < 1 || target > 240) return fr ? "L'objectif de livraison doit être entre 1 et 240 heures." : "The delivery-time target must be between 1 and 240 hours.";
  return null;
}

/** What is sent to `hubSettings:update`: only the fields that changed (so saving one thing never overwrites another manager's edit). */
export function formToPatch(f: HubOpsForm, current: Pick<HubOpsSettings, "workStart" | "workEnd" | "workDays" | "timezone" | "batchSize" | "autoAssign" | "agedLevels" | "deliveryTargetHours">): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (f.workStart !== current.workStart) patch.workStart = f.workStart;
  if (f.workEnd !== current.workEnd) patch.workEnd = f.workEnd;
  const days = [...f.workDays].sort((a, b) => a - b);
  if (days.join(",") !== [...current.workDays].sort((a, b) => a - b).join(",")) patch.workDays = days;
  if (f.timezone.trim() !== current.timezone) patch.timezone = f.timezone.trim();
  if (whole(f.batchSize) !== current.batchSize) patch.batchSize = whole(f.batchSize);
  if (f.autoAssign !== current.autoAssign) patch.autoAssign = f.autoAssign;
  const ages = f.agedLevels.map(whole);
  if (ages.join(",") !== current.agedLevels.join(",")) patch.agedLevels = ages;
  const target = Number(f.deliveryTargetHours.trim().replace(",", "."));
  if (target !== current.deliveryTargetHours) patch.deliveryTargetHours = target;
  return patch;
}

// ── aged parcels ─────────────────────────────────────────────────────────────

/** The alert level (0..3) of a leg of this age against the warehouse's ages. */
export function levelOfAge(hours: number, levels: readonly number[]): number {
  return levels.filter((h) => hours >= h).length;
}

/** "26 h" under two days, "3 d" after. */
export function ageText(hours: number, fr: boolean): string {
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.floor(hours / 24)} ${fr ? "j" : "d"}`;
}

/** May a stuck leg go back to its seller? The customer-bound leg, still at the warehouse (no rider has collected it), outside a run. */
export function canReturnLeg(t: { kind: string; status: string; runId?: string | null }): boolean {
  return (t.kind === "delivery" || t.kind === "replacement_delivery") && (t.status === "unassigned" || t.status === "assigned") && !t.runId;
}

// ── analytics ────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` of a date in UTC (the API reads bare dates as UTC days). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The default period: the last 30 days, today included. */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
  return { from: isoDay(new Date(now.getTime() - 29 * 86_400_000)), to: isoDay(now) };
}

/** A problem with a typed period, or null. The server checks again (at most a year, start before end). */
export function rangeProblem(from: string, to: string, fr: boolean): string | null {
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
  if (!ok(from) || !ok(to)) return fr ? "Choisissez une date de début et une date de fin." : "Choose a start date and an end date.";
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 0) return fr ? "La date de début doit précéder la date de fin." : "The start date must be before the end date.";
  if (days >= 366) return fr ? "Choisissez une période d'un an au maximum." : "Choose a period of at most a year.";
  return null;
}

/** "3 h 20 min" or "1.5 h" style hours: whole minutes under an hour, one decimal after. */
export function hoursText(h: number | null | undefined, fr: boolean): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${(Math.round(h * 10) / 10).toLocaleString(fr ? "fr-FR" : "en-US")} h`;
}

export const pctText = (p: number | null | undefined): string => (p == null ? "—" : `${p}%`);
