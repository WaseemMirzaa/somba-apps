/**
 * Rider vehicle and compliance documents: the closed lists, the validation and the expiry arithmetic. Pure functions, no
 * database, so the server, the tests and the contract all read the same rules.
 *
 * Nothing here ever stops a rider from working: an expired or rejected document is shown as a warning, never enforced.
 */
import { optStr, num, oneOf } from '../common/validate';

export const VEHICLE_TYPES = ['motorbike', 'scooter', 'bicycle', 'car', 'van', 'truck', 'other'] as const;
export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid', 'none'] as const;
export const DOCUMENT_TYPES = ['driver_licence', 'vehicle_insurance', 'vehicle_registration', 'id_card', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type FuelType = (typeof FUEL_TYPES)[number];

/** A document an upload may carry: JPEG, PNG or PDF (the private store sniffs the real type from the bytes). */
export const DOCUMENT_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
/** A rider cannot flood the review queue. */
export const MAX_DOCUMENTS_PER_RIDER = 30;
/** A document is "expiring" from this many days before its last valid day. */
export const EXPIRING_DAYS = 30;

export type ExpiryState = 'none' | 'valid' | 'expiring' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of a moment, in UTC (the API's calendar day everywhere). */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** A real calendar date written `YYYY-MM-DD` between 2000 and 2100, or an error naming the field. */
export function dateOf(x: unknown, field: string): string {
  const s = typeof x === 'string' ? x.trim() : '';
  const m = DATE_RE.exec(s);
  const ms = m ? Date.parse(`${s}T00:00:00Z`) : NaN;
  const ok = !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 && Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
  if (!ok) throw new Error(`${field} must be a date written YYYY-MM-DD.`);
  return s;
}

/** Optional date: undefined/null/'' -> null. */
export function optDate(x: unknown, field: string): string | null {
  if (x === undefined || x === null || x === '') return null;
  return dateOf(x, field);
}

/**
 * Where a document stands against a day: `expired` after its last valid day, `expiring` in the last {@link EXPIRING_DAYS} days
 * (the last valid day included), `valid` otherwise, `none` when it has no expiry date. `daysLeft` is negative once expired.
 */
export function expiryOf(expiresOn: string | null | undefined, now: Date = new Date()): { state: ExpiryState; daysLeft: number | null } {
  if (!expiresOn || !DATE_RE.test(expiresOn)) return { state: 'none', daysLeft: null };
  const daysLeft = Math.round(dayNumber(expiresOn) - dayNumber(utcDay(now)));
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  return { state: daysLeft <= EXPIRING_DAYS ? 'expiring' : 'valid', daysLeft };
}

export interface VehicleInput {
  model: string | null;
  type: VehicleType | null;
  plate: string | null;
  colour: string | null;
  odometerKm: number | null;
  fuel: FuelType | null;
  insuranceValidUntil: string | null;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
}

/** The fields staff may send; anything else in the payload is ignored. */
export const VEHICLE_FIELDS = ['model', 'type', 'plate', 'colour', 'odometerKm', 'fuel', 'insuranceValidUntil', 'lastServiceOn', 'nextServiceOn'] as const;
export type VehicleField = (typeof VEHICLE_FIELDS)[number];

const blank = (x: unknown): boolean => x === null || x === '' || (typeof x === 'string' && x.trim() === '');

/**
 * Validate a vehicle patch. Only the keys present are returned: a key sent as null or '' clears that field. Throws an Error
 * whose message is safe to show.
 */
export function parseVehiclePatch(raw: unknown): Partial<VehicleInput> {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Partial<VehicleInput> = {};
  const has = (k: VehicleField) => body[k] !== undefined;
  if (has('model')) out.model = optStr(body.model, 'Model', 80);
  if (has('type')) out.type = blank(body.type) ? null : oneOf(body.type, VEHICLE_TYPES, 'Type');
  if (has('plate')) {
    const p = optStr(body.plate, 'Plate', 20);
    out.plate = p ? p.toUpperCase() : null;
  }
  if (has('colour')) out.colour = optStr(body.colour, 'Colour', 40);
  if (has('odometerKm')) out.odometerKm = blank(body.odometerKm) ? null : num(body.odometerKm, 'Odometer', { min: 0, max: 5_000_000, int: true });
  if (has('fuel')) out.fuel = blank(body.fuel) ? null : oneOf(body.fuel, FUEL_TYPES, 'Fuel');
  if (has('insuranceValidUntil')) out.insuranceValidUntil = optDate(body.insuranceValidUntil, 'Insurance valid until');
  if (has('lastServiceOn')) out.lastServiceOn = optDate(body.lastServiceOn, 'Last service');
  if (has('nextServiceOn')) out.nextServiceOn = optDate(body.nextServiceOn, 'Next service');
  return out;
}

export interface DocumentInput {
  type: DocumentType;
  number: string | null;
  expiresOn: string | null;
  fileId: string;
}

/** Validate an upload request (the file itself was already stored by `POST /api/v1/private-uploads`). */
export function parseDocumentInput(raw: unknown): DocumentInput {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fileId = typeof body.fileId === 'string' ? body.fileId.trim() : '';
  if (!/^[0-9a-f-]{36}$/.test(fileId)) throw new Error('Upload the file first, then send it with its file id.');
  return {
    type: oneOf(body.type, DOCUMENT_TYPES, 'Document type'),
    number: optStr(body.number, 'Document number', 60),
    expiresOn: optDate(body.expiresOn, 'Expiry date'),
    fileId,
  };
}

/** A rejection must say why (the rider reads it and uploads a better copy). */
export function rejectionReason(x: unknown): string {
  const s = typeof x === 'string' ? x.trim() : '';
  if (s.length < 3 || s.length > 300) throw new Error('Give a reason of 3-300 characters.');
  return s;
}
