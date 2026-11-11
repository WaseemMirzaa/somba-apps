import { randomInt } from 'crypto';

/** No 0 / O / 1 / I: a label read by eye or typed on a phone cannot be mistaken. */
export const PARCEL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PARCEL_PREFIX = 'PKG-';
export const PARCEL_CODE_LENGTH = 8;
/** The most boxes one seller package can be split into. */
export const MAX_BOXES = 20;

const SHAPE = new RegExp(`^${PARCEL_PREFIX}[${PARCEL_CODE_ALPHABET}]{${PARCEL_CODE_LENGTH}}$`);

/** One random code. `pick` is injectable so a test can force a collision. */
export function randomParcelCode(pick: (max: number) => number = (max) => randomInt(max)): string {
  let s = '';
  for (let i = 0; i < PARCEL_CODE_LENGTH; i++) s += PARCEL_CODE_ALPHABET[pick(PARCEL_CODE_ALPHABET.length)];
  return PARCEL_PREFIX + s;
}

/** A code made unique against `exists` (collision checked): retries, then gives up loudly rather than reuse one. */
export async function uniqueParcelCode(exists: (code: string) => Promise<boolean>, make: () => string = randomParcelCode, tries = 12): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const code = make();
    if (!(await exists(code))) return code;
  }
  throw new Error('Could not make a unique parcel code. Try again.');
}

/** What a rider typed or a camera read, as a code: upper case, spaces removed, the dash optional. Null when it is not shaped like one. */
export function normalizeParcelCode(raw: unknown): string | null {
  let s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  if (s.startsWith('PKG') && s[3] !== '-') s = `${PARCEL_PREFIX}${s.slice(3)}`;
  return SHAPE.test(s) ? s : null;
}

/** The box count the seller asked for: a whole number from 1 to {@link MAX_BOXES}, default 1. */
export function cleanBoxCount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_BOXES) throw new Error(`Boxes must be a whole number from 1 to ${MAX_BOXES}.`);
  return n;
}
