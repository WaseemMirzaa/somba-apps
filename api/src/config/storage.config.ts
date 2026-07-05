import { join, isAbsolute } from 'path';
import { UploadContext } from '../common/enums';

/**
 * Single storage configuration (same env), routed to a different sub-path per
 * upload context. Everything lives under ONE base directory defined by the
 * `UPLOAD_DIR` env var; each feature just picks a different sub-folder.
 *
 *   UPLOAD_DIR=/var/somba/uploads
 *     products    -> /var/somba/uploads/products
 *     sellers/kyc -> /var/somba/uploads/sellers/kyc
 *     promotions  -> /var/somba/uploads/promotions
 */
export function uploadBaseDir(): string {
  const base = process.env.UPLOAD_DIR || './uploads';
  return isAbsolute(base) ? base : join(process.cwd(), base);
}

/** Absolute directory on disk for a given upload context. */
export function uploadDirFor(context: UploadContext): string {
  return join(uploadBaseDir(), context);
}

/** Public base path the static server exposes uploads under. */
export function uploadPublicPrefix(): string {
  return process.env.UPLOAD_PUBLIC_PREFIX || '/uploads';
}

/** Public URL for a stored file. */
export function publicUrlFor(context: UploadContext, filename: string): string {
  const prefix = uploadPublicPrefix().replace(/\/$/, '');
  return `${prefix}/${context}/${filename}`;
}
