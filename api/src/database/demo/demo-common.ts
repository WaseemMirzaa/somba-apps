import { createHash, randomBytes } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'fs';
import { dirname } from 'path';

/**
 * Everything the demo creates is tied to users with this e-mail domain (RFC 2606 reserves `.test`: it can never
 * be a real mailbox). Stores belong to those users, listings to those stores, orders to those users, and so on.
 */
export const DEMO_DOMAIN = 'demo.sombateka.test';
export const demoEmail = (local: string) => `${local}@${DEMO_DOMAIN}`;
export const isDemoEmail = (email: string | null | undefined) =>
  (email ?? '').toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** Prefix of the keys, codes and names that belong to the demo but are not users (CMS blocks, promo codes, bins). */
export const DEMO_KEY = 'demo-';

/** Hub names the demo adds (the real warehouse is never touched). */
export const DEMO_HUB_NAME = 'Entrepôt Maluku (démo)';

export const log = (msg: string) => console.log(msg);

/** A strong random password that is easy to type: 18 letters and digits, no look-alikes, plus a symbol and digits. */
export function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(18);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out}-${(randomBytes(2).readUInt16BE() % 90) + 10}`;
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** One account's entry in the credentials file. */
export interface CredentialEntry {
  email: string;
  role: string;
  password: string | null;
  totpKey?: string | null;
  recoveryCodes?: string[];
  scenario: string;
}

/**
 * The credentials file: plain text blocks, root-only on a server (mode 600). It is read back on a re-run so an account
 * that already exists keeps the password it was given.
 */
export function readCredentials(
  path: string,
): Map<string, { password: string | null; recoveryCodes: string[] }> {
  const out = new Map<
    string,
    { password: string | null; recoveryCodes: string[] }
  >();
  if (!existsSync(path)) return out;
  let email = '';
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    const head = /^\[(.+@.+)\]$/.exec(line);
    if (head) {
      email = head[1].toLowerCase();
      out.set(email, { password: null, recoveryCodes: [] });
      continue;
    }
    const entry = email ? out.get(email) : undefined;
    if (!entry) continue;
    const pw = /^password\s*=\s*(\S.*)$/.exec(line);
    if (pw && pw[1] !== '(unknown)') entry.password = pw[1].trim();
    const rc = /^recovery_codes\s*=\s*(\S.*)$/.exec(line);
    if (rc) entry.recoveryCodes = rc[1].trim().split(/\s+/);
  }
  return out;
}

export function writeCredentials(
  path: string,
  entries: CredentialEntry[],
  header: string[],
): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [...header.map((h) => `# ${h}`), ''];
  for (const e of entries) {
    lines.push(
      `[${e.email}]`,
      `role = ${e.role}`,
      `password = ${e.password ?? '(unknown)'}`,
    );
    if (e.totpKey) lines.push(`totp_key = ${e.totpKey}`);
    if (e.recoveryCodes?.length)
      lines.push(`recovery_codes = ${e.recoveryCodes.join(' ')}`);
    lines.push(`scenario = ${e.scenario}`, '');
  }
  writeFileSync(path, lines.join('\n'), { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Days ago as a Date. */
export const daysAgo = (days: number, hour = 10): Date => {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setUTCHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return d;
};
