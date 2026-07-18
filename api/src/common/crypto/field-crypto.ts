import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Pure AES-256-GCM helpers usable OUTSIDE Nest DI (e.g. TypeORM column
 * transformers, which are constructed at class-decoration time before the
 * DI container exists). The key is resolved lazily from `DATA_ENCRYPTION_KEY`
 * the first time it's needed, so `.env` (loaded at bootstrap) is respected.
 */
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc::';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.DATA_ENCRYPTION_KEY ?? '0'.repeat(64);
  cachedKey = /^[0-9a-fA-F]{64}$/.test(hex)
    ? Buffer.from(hex, 'hex')
    : scryptSync(hex, 'somba-field-encryption', 32);
  return cachedKey;
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptField(token: string | null | undefined): string | null {
  if (token === null || token === undefined) return null;
  if (!token.startsWith(PREFIX)) return token; // plaintext / legacy value
  try {
    const raw = Buffer.from(token.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** TypeORM ValueTransformer that transparently encrypts a text column. */
export const encryptedColumn = {
  to: (value: string | null | undefined): string | null => encryptField(value),
  from: (value: string | null | undefined): string | null => decryptField(value),
};
