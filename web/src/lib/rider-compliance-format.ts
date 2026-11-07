/**
 * Pure helpers for the rider "Vehicle & compliance" section (docs/contracts/rider-compliance.md). No imports, so the tests load this
 * file as is. The server validates and decides everything again: these only give staff quick feedback and shape what is sent.
 * Nothing here ever blocks a rider: an expired document is a badge, not a rule.
 */

export type ExpiryState = "none" | "valid" | "expiring" | "expired";
export type DocStatus = "pending" | "approved" | "rejected";

export interface VehicleView {
  riderId: string;
  exists: boolean;
  model: string | null;
  type: string | null;
  plate: string | null;
  colour: string | null;
  odometerKm: number | null;
  fuel: string | null;
  insuranceValidUntil: string | null;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
  insurance: { state: ExpiryState; daysLeft: number | null };
  service: { state: ExpiryState; daysLeft: number | null };
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface DocumentView {
  id: string;
  riderId: string;
  type: string;
  number: string | null;
  expiresOn: string | null;
  expiry: { state: ExpiryState; daysLeft: number | null };
  status: DocStatus;
  fileId: string;
  mime: string;
  size: number;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ComplianceView {
  rider: { id: string; name: string; hubId: string | null };
  vehicle: VehicleView;
  documents: DocumentView[];
  canEdit: boolean;
}

type L = { en: string; fr: string };

export const VEHICLE_TYPES: Record<string, L> = {
  motorbike: { en: "Motorbike", fr: "Moto" },
  scooter: { en: "Scooter", fr: "Scooter" },
  bicycle: { en: "Bicycle", fr: "Vélo" },
  car: { en: "Car", fr: "Voiture" },
  van: { en: "Van", fr: "Camionnette" },
  truck: { en: "Truck", fr: "Camion" },
  other: { en: "Other", fr: "Autre" },
};

export const FUEL_TYPES: Record<string, L> = {
  petrol: { en: "Petrol", fr: "Essence" },
  diesel: { en: "Diesel", fr: "Diesel" },
  electric: { en: "Electric", fr: "Électrique" },
  hybrid: { en: "Hybrid", fr: "Hybride" },
  none: { en: "None (pedal)", fr: "Aucun (pédalage)" },
};

export const DOCUMENT_TYPES: Record<string, L> = {
  driver_licence: { en: "Driver licence", fr: "Permis de conduire" },
  vehicle_insurance: { en: "Vehicle insurance", fr: "Assurance du véhicule" },
  vehicle_registration: { en: "Vehicle registration", fr: "Carte grise" },
  id_card: { en: "ID", fr: "Pièce d'identité" },
  other: { en: "Other", fr: "Autre" },
};

export const DOC_STATUS: Record<DocStatus, L> = {
  pending: { en: "Pending review", fr: "À examiner" },
  approved: { en: "Approved", fr: "Approuvé" },
  rejected: { en: "Rejected", fr: "Refusé" },
};

export const pickL = (l: L | undefined, fr: boolean, fallback = ""): string => (l ? (fr ? l.fr : l.en) : fallback);

/** Badge colour of a review status. */
export const statusVariant = (s: DocStatus): "warning" | "success" | "danger" => (s === "approved" ? "success" : s === "rejected" ? "danger" : "warning");

/**
 * The expiry badge: nothing for "no date" and "valid"; amber for "expires in N days"; red for "expired N days ago". For a service
 * date, `overdue` replaces "expired". Returns null when no badge is needed.
 */
export function expiryBadge(e: { state: ExpiryState; daysLeft: number | null } | null | undefined, fr: boolean, kind: "document" | "service" = "document"): { text: string; variant: "warning" | "danger" } | null {
  if (!e || e.daysLeft === null) return null;
  const n = Math.abs(e.daysLeft);
  if (e.state === "expired") {
    const word = kind === "service" ? (fr ? "En retard" : "Overdue") : fr ? "Expiré" : "Expired";
    return { text: `${word} · ${fr ? `depuis ${n} j` : `${n} d ago`}`, variant: "danger" };
  }
  if (e.state === "expiring") {
    const word = kind === "service" ? (fr ? "À faire" : "Due") : fr ? "Expire" : "Expires";
    return { text: e.daysLeft === 0 ? `${word} · ${fr ? "aujourd'hui" : "today"}` : `${word} · ${fr ? `dans ${n} j` : `in ${n} d`}`, variant: "warning" };
  }
  return null;
}

/** How many documents are expired / expiring / waiting / rejected (for the summary line). Rejected documents do not count as expired. */
export function summarize(docs: Pick<DocumentView, "status" | "expiry">[]): { expired: number; expiring: number; pending: number; rejected: number } {
  const live = docs.filter((d) => d.status !== "rejected");
  return {
    expired: live.filter((d) => d.expiry.state === "expired").length,
    expiring: live.filter((d) => d.expiry.state === "expiring").length,
    pending: docs.filter((d) => d.status === "pending").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };
}

/** A `YYYY-MM-DD` day written for a reader, never shifted by a time zone. */
export function fmtDay(iso: string | null | undefined, fr: boolean): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(fr ? "fr-FR" : "en-GB", { timeZone: "UTC", dateStyle: "medium" });
}

/** What the vehicle form edits: every field as text so a half-typed number is not lost. */
export interface VehicleForm {
  model: string;
  type: string;
  plate: string;
  colour: string;
  odometerKm: string;
  fuel: string;
  insuranceValidUntil: string;
  lastServiceOn: string;
  nextServiceOn: string;
}

export const vehicleToForm = (v: Pick<VehicleView, keyof VehicleForm>): VehicleForm => ({
  model: v.model ?? "",
  type: v.type ?? "",
  plate: v.plate ?? "",
  colour: v.colour ?? "",
  odometerKm: v.odometerKm === null || v.odometerKm === undefined ? "" : String(v.odometerKm),
  fuel: v.fuel ?? "",
  insuranceValidUntil: v.insuranceValidUntil ?? "",
  lastServiceOn: v.lastServiceOn ?? "",
  nextServiceOn: v.nextServiceOn ?? "",
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string): boolean => DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The first thing wrong with the form, in the reader's language, or null. */
export function vehicleProblem(f: VehicleForm, fr: boolean): string | null {
  if (f.model.trim().length > 80) return fr ? "Le modèle fait 80 caractères au maximum." : "The model is 80 characters at most.";
  if (f.plate.trim().length > 20) return fr ? "La plaque fait 20 caractères au maximum." : "The plate is 20 characters at most.";
  if (f.colour.trim().length > 40) return fr ? "La couleur fait 40 caractères au maximum." : "The colour is 40 characters at most.";
  const km = f.odometerKm.trim();
  if (km && !(/^\d+$/.test(km) && Number(km) <= 5_000_000)) return fr ? "Le compteur est un nombre entier de kilomètres (0 à 5 000 000)." : "The odometer is a whole number of kilometres (0 to 5,000,000).";
  const days: [string, string, string][] = [
    [f.insuranceValidUntil, "La fin de l'assurance", "Insurance valid until"],
    [f.lastServiceOn, "Le dernier entretien", "Last service"],
    [f.nextServiceOn, "Le prochain entretien", "Next service"],
  ];
  for (const [v, labelFr, labelEn] of days) if (v && !realDay(v)) return fr ? `${labelFr} doit être une date valide.` : `${labelEn} must be a valid date.`;
  return null;
}

/** Only what changed, with numbers as numbers and a cleared field as null. An unchanged form sends nothing. */
export function vehicleToPatch(f: VehicleForm, current: Pick<VehicleView, keyof VehicleForm>): Record<string, string | number | null> {
  const before = vehicleToForm(current);
  const out: Record<string, string | number | null> = {};
  for (const k of Object.keys(before) as (keyof VehicleForm)[]) {
    const now = f[k].trim();
    if (now === before[k]) continue;
    out[k] = now === "" ? null : k === "odometerKm" ? Number(now) : now;
  }
  return out;
}

/** A rejection reason as the server wants it: 3 to 300 characters. */
export function reasonProblem(reason: string, fr: boolean): string | null {
  const n = reason.trim().length;
  if (n >= 3 && n <= 300) return null;
  return fr ? "Indiquez un motif de 3 à 300 caractères." : "Give a reason of 3 to 300 characters.";
}
