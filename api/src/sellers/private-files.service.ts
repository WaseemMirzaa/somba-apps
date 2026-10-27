import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, copyFileSync } from 'fs';
import { basename, join } from 'path';
import { Repository } from 'typeorm';
import { PrivateFile, Seller } from '../database/entities';
import { parseJsonList } from '../database/entities/seller.entity';
import { UPLOAD_DIR } from '../uploads/uploads.controller';
import { privateIdOf } from './private-url';

export { privateIdOf };

export const PRIVATE_UPLOAD_DIR = process.env.PRIVATE_UPLOAD_DIR ?? join(process.cwd(), 'uploads-private');
/** Same cap as the public uploads, and under the proxy's 6 MB body limit. */
export const MAX_PRIVATE_BYTES = 5 * 1024 * 1024;
/** Roles that review applications and may open any store's documents. */
export const KYC_REVIEWERS: readonly string[] = ['admin', 'admin_moderation', 'admin_operations'];
const LINK_TTL_MS = 5 * 60_000;
const PUBLIC_PATH = /^\/uploads\/([0-9a-f-]{36})\.(png|jpg|webp)$/;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };

/** Detects the real type from the file's leading bytes (never trusts the client MIME). */
export function sniffPrivate(buf: Buffer): 'png' | 'jpg' | 'webp' | 'pdf' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  return null;
}

/**
 * Store KYC documents OUTSIDE the public /uploads folder. A file is downloaded only through
 * `GET /api/v1/private-uploads/:id` by its owner or a reviewer; a short-lived signed link (made by an authorised
 * socket call) lets a browser open it in a tab without sending a header.
 */
@Injectable()
export class PrivateFilesService implements OnModuleInit {
  private readonly logger = new Logger('PrivateFiles');

  constructor(
    @InjectRepository(PrivateFile) private readonly files: Repository<PrivateFile>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return `${this.config.get<string>('jwt.secret') ?? 'dev'}:private-files`;
  }

  private base(): string {
    return (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
  }

  urlFor(id: string, origin?: string): string {
    return `${(origin ?? this.base()).replace(/\/$/, '')}/api/v1/private-uploads/${id}`;
  }

  /** Move documents that older store applications left in the public folder behind the login. Idempotent. */
  async onModuleInit(): Promise<void> {
    try {
      const moved = await this.migrateLegacyKyc();
      if (moved) this.logger.log(`Moved ${moved} KYC document(s) out of the public uploads folder.`);
    } catch (e) {
      this.logger.warn(`KYC document migration skipped: ${(e as Error).message}`);
    }
  }

  async migrateLegacyKyc(): Promise<number> {
    let moved = 0;
    const rows = await this.sellers.find({ select: { id: true, userId: true, documentUrls: true } });
    for (const s of rows) {
      const urls = parseJsonList(s.documentUrls);
      if (!urls.some((u) => this.publicName(u))) continue;
      const owner = s.userId ?? s.id;
      const next = await this.adopt(urls, owner, { strict: false });
      moved += next.filter((u, i) => u !== urls[i]).length;
      await this.sellers.update({ id: s.id }, { documentUrls: JSON.stringify(next) });
    }
    return moved;
  }

  /** `<uuid>.<ext>` when the URL points into the public uploads folder. */
  private publicName(url: string): string | null {
    try {
      const m = PUBLIC_PATH.exec(new URL(url).pathname);
      return m ? `${m[1]}.${m[2]}` : null;
    } catch {
      return null;
    }
  }

  /**
   * Turn a list of document URLs into private ones: a public upload is MOVED (copied behind the login, then deleted
   * from the public folder); a private URL must be the owner's own file. `strict` refuses anything else.
   */
  async adopt(urls: string[], ownerUserId: string, opts: { strict?: boolean } = {}): Promise<string[]> {
    const strict = opts.strict !== false;
    const out: string[] = [];
    for (const url of urls) {
      const priv = privateIdOf(url);
      if (priv) {
        const f = await this.files.findOne({ where: { id: priv } });
        if (!f || f.ownerUserId !== ownerUserId) {
          if (strict) throw new BadRequestException('Document is not valid. Upload it again.');
          out.push(url);
          continue;
        }
        out.push(url);
        continue;
      }
      const name = this.publicName(url);
      const src = name ? join(UPLOAD_DIR, name) : null;
      if (!name || !src || !existsSync(src)) {
        // Not a file this server holds (already moved, or never uploaded here): nothing to protect, keep the entry.
        out.push(url);
        continue;
      }
      const ext = name.split('.')[1];
      const stored = `${randomUUID()}.${ext}`;
      mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
      const dst = join(PRIVATE_UPLOAD_DIR, stored);
      try {
        renameSync(src, dst);
      } catch {
        copyFileSync(src, dst); // another device / filesystem
        unlinkSync(src);
      }
      const row = await this.files.save(
        this.files.create({ ownerUserId, kind: 'kyc', storedName: stored, mime: MIME[ext] ?? 'application/octet-stream', size: statSync(dst).size }),
      );
      out.push(this.urlFor(row.id, new URL(url).origin));
    }
    return out;
  }

  /** Save an upload (already sniffed) for its owner. */
  async save(ownerUserId: string, buf: Buffer, origin?: string): Promise<{ id: string; url: string; mime: string; size: number }> {
    const ext = sniffPrivate(buf);
    if (!ext) throw new BadRequestException('Only JPEG, PNG, WebP or PDF files are allowed.');
    if (buf.length > MAX_PRIVATE_BYTES) throw new BadRequestException('The file is too large (5 MB at most).');
    mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
    const stored = `${randomUUID()}.${ext}`;
    writeFileSync(join(PRIVATE_UPLOAD_DIR, stored), buf);
    const row = await this.files.save(this.files.create({ ownerUserId, kind: 'kyc', storedName: stored, mime: MIME[ext], size: buf.length }));
    return { id: row.id, url: this.urlFor(row.id, origin), mime: row.mime, size: row.size };
  }

  /** May this account read the file? Its owner, and the people who review applications. */
  canRead(user: { id: string; role: string }, file: Pick<PrivateFile, 'ownerUserId'>): boolean {
    return file.ownerUserId === user.id || KYC_REVIEWERS.includes(user.role);
  }

  async open(user: { id: string; role: string }, id: string): Promise<{ path: string; mime: string; name: string }> {
    const f = id && /^[0-9a-f-]{36}$/.test(id) ? await this.files.findOne({ where: { id } }) : null;
    // Same answer for "no such file" and "not yours", so ids cannot be probed.
    if (!f || !this.canRead(user, f)) throw new NotFoundException('File not found.');
    const path = join(PRIVATE_UPLOAD_DIR, basename(f.storedName));
    if (!existsSync(path)) throw new NotFoundException('File not found.');
    return { path, mime: f.mime, name: f.storedName };
  }

  // ── Signed links ─────────────────────────────────────────────────────────
  private sign(id: string, uid: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${id}.${uid}.${exp}`).digest('hex');
  }

  /** A link that opens the file for 5 minutes without an Authorization header; only handed to an account that may read it. */
  async link(user: { id: string; role: string }, id: string, origin?: string): Promise<{ url: string; expiresAt: string }> {
    await this.open(user, id);
    const exp = Date.now() + LINK_TTL_MS;
    return { url: `${this.urlFor(id, origin)}?uid=${encodeURIComponent(user.id)}&exp=${exp}&sig=${this.sign(id, user.id, exp)}`, expiresAt: new Date(exp).toISOString() };
  }

  /** The account a valid signed link was made for (null when the signature or the date is wrong). */
  verifyLink(id: string, uid: string, exp: number, sig: string): string | null {
    if (!uid || !Number.isFinite(exp) || exp < Date.now() || !/^[0-9a-f]{64}$/.test(sig ?? '')) return null;
    const want = Buffer.from(this.sign(id, uid, exp));
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want) ? uid : null;
  }

  readFile(path: string): Buffer {
    return readFileSync(path);
  }
}
