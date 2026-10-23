import { createHash } from 'crypto';

/**
 * Phone numbers are stored encrypted, so logins look them up by a deterministic hash of the NORMALISED number:
 * digits only, DRC local format ("081 234 5678" / "0812345678") turned into international ("243812345678").
 * "+243 81 234 5678", "00243812345678" and "0812345678" therefore all match the same account.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = `243${d.slice(1)}`; // DRC national format
  return d.length >= 9 && d.length <= 15 ? d : null;
}

export function phoneHash(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n ? createHash('sha256').update(`phone:${n}`).digest('hex') : null;
}
