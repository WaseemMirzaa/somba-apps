import { BadRequestException } from '@nestjs/common';
import { isIP } from 'net';

/** A file this platform stored: `POST /api/v1/uploads` answers `<api>/uploads/<uuid>.<ext>`. Any host: the API URL differs per environment. */
const OWN_UPLOAD = /^(?:https?:\/\/[^/\s]+)?\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i;

export const MAX_IMAGE_URL = 500;
export const MAX_IMAGES = 8;

/** True for a host a public image can never live on (this machine, a private network, a metadata address). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0') return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (kind === 6) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

/**
 * A product picture must be one of our own uploads, or an https URL on a public host. Anything else (http, data:,
 * javascript:, a private address, credentials in the URL) is refused. Returns the trimmed URL.
 */
export function productImageUrl(value: unknown, label = 'Image'): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new BadRequestException(`${label} is empty.`);
  if (v.length > MAX_IMAGE_URL) throw new BadRequestException(`${label} link is too long.`);
  if (OWN_UPLOAD.test(v)) return v;
  if (/[\s\u0000-\u001f]/.test(v)) throw new BadRequestException(`${label} link is not valid.`);
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new BadRequestException(`${label} link is not valid.`);
  }
  if (url.protocol !== 'https:') throw new BadRequestException(`${label} must be an upload or a secure (https) link.`);
  if (url.username || url.password) throw new BadRequestException(`${label} link is not valid.`);
  if (isPrivateHost(url.hostname)) throw new BadRequestException(`${label} link is not valid.`);
  return v;
}

/** A gallery: up to {@link MAX_IMAGES} distinct pictures, in order (the first is the cover). */
export function productImageList(value: unknown, label = 'Images'): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (!Array.isArray(value)) throw new BadRequestException(`${label} must be a list of links.`);
  if (value.length > MAX_IMAGES) throw new BadRequestException(`At most ${MAX_IMAGES} pictures per product.`);
  const out: string[] = [];
  for (const [i, v] of value.entries()) {
    const url = productImageUrl(v, `Picture ${i + 1}`);
    if (!out.includes(url)) out.push(url);
  }
  return out;
}
