import { BadRequestException } from '@nestjs/common';

/** How many photos a request, message or ticket may carry. */
export const MAX_ATTACHMENTS = 6;

/**
 * A photo must be a file this platform stored (`POST /api/v1/uploads` → `/uploads/<uuid>.<ext>`). The endpoint writes
 * png, jpg, webp and heic (iPhone photos); `.jpeg` is accepted too for links made by other tools.
 */
export const UPLOAD_PATH = /^\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|webp|heic)$/i;

export function isUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    return UPLOAD_PATH.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/**
 * Photos sent with a message or request: nothing/null -> []; otherwise a list of upload URLs (duplicates dropped, at
 * most {@link MAX_ATTACHMENTS}). Anything else is refused, so nobody can point another user's screen at a third-party link.
 */
export function cleanAttachments(raw: unknown, max = MAX_ATTACHMENTS): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw new BadRequestException('Photos must be a list of uploaded images.');
  const urls = [...new Set(raw)];
  if (urls.length > max) throw new BadRequestException(`You can attach up to ${max} photos.`);
  if (!urls.every(isUploadUrl)) throw new BadRequestException('Photos must be images uploaded through the app.');
  return urls;
}

/** The stored JSON column as a list (never throws). */
export function parseAttachments(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const storeAttachments = (list: string[]): string | null => (list.length ? JSON.stringify(list) : null);

/** First name only: what sellers get to see of a customer. */
export function firstName(full: string | null | undefined): string {
  const s = String(full ?? '').trim();
  return s ? s.split(/\s+/)[0] : '';
}

/**
 * What a seller may see of a customer's request: the first name, never the account id. The viewer's own purchases
 * (a seller who also shops) stay whole.
 */
export function redactForSeller<T extends { customerId?: string | null; customerName?: string | null }>(row: T, viewerId?: string): T {
  if (viewerId && row.customerId === viewerId) return row;
  const copy = { ...row } as Record<string, unknown>;
  delete copy.customerId;
  copy.customerName = firstName(row.customerName);
  return copy as T;
}
