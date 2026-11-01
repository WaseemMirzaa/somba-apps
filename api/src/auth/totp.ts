import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226): HMAC-SHA1, 30-second steps, 6 digits, the same as Google
 * Authenticator, Authy and 1Password expect. Implemented with node `crypto` (no dependency). Pure and unit-tested
 * against the RFC test vectors.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and the next step as well, to forgive a phone clock that is a few seconds off. */
export const TOTP_WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit shared secret, base32 (32 characters). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const totpStep = (nowMs = Date.now()): number => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

/** The code shown by an authenticator app at this moment. */
export function totpCode(secretB32: string, nowMs = Date.now()): string {
  return hotp(base32Decode(secretB32), totpStep(nowMs));
}

/**
 * Check a typed code. Returns the matching step (so the caller can refuse to accept it twice) or null. Only steps
 * AFTER `lastStep` are accepted: a code that was already used cannot be replayed within its window.
 */
export function verifyTotp(secretB32: string, code: string, opts: { nowMs?: number; lastStep?: number } = {}): number | null {
  const typed = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return null;
  const key = base32Decode(secretB32);
  const now = totpStep(opts.nowMs);
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    if (step <= (opts.lastStep ?? 0)) continue;
    const expected = hotp(key, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(typed))) return step;
  }
  return null;
}

/** The `otpauth://` link an authenticator app (or a QR code of it) takes. */
export function otpauthUrl(secretB32: string, account: string, issuer = 'Somba&Teka'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes ──────────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10;

/** `xxxx-xxxx` from an unambiguous alphabet (no 0/O/1/I), easy to copy from paper. */
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => {
    const raw = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export const normalizeRecovery = (code: string): string => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const looksLikeRecovery = (code: string): boolean => normalizeRecovery(code).length === 8 && !/^\d{6}$/.test(String(code ?? '').replace(/\s/g, ''));
export const hashRecovery = (code: string): string => createHash('sha256').update(`recovery:${normalizeRecovery(code)}`).digest('hex');
