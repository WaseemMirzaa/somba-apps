import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { Repository } from 'typeorm';
import { DeliveryProof, DeliveryTask, User } from '../database/entities';

/** The customer-facing handover legs: the only ones that take a photo or a signature. */
export const PROOF_KINDS: readonly string[] = ['delivery', 'replacement_delivery'];
/** Admin roles that may open a delivery's proof (everyone who works disputes or operations); warehouse staff see their own warehouse's. */
export const PROOF_ADMINS: readonly string[] = ['admin', 'admin_operations', 'admin_support'];
/** Limits per file; together they stay under the proxy's 6 MB body limit. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 1024 * 1024;
/** A rider can still attach proof this long after marking the leg delivered (a retry after a lost answer). */
export const LATE_PROOF_MS = 30 * 60_000;
const LINK_TTL_MS = 5 * 60_000;

export type ProofPart = 'photo' | 'signature';
export const PROOF_PARTS: readonly ProofPart[] = ['photo', 'signature'];
type Ext = 'jpg' | 'png';
const MIME: Record<Ext, string> = { jpg: 'image/jpeg', png: 'image/png' };

/** The private folder for proof files (inside `PRIVATE_UPLOAD_DIR`, never under the public /uploads). Read at call time. */
export const proofDir = () => join(process.env.PRIVATE_UPLOAD_DIR ?? join(process.cwd(), 'uploads-private'), 'pod');

/** The real type from the leading bytes (never the client's MIME): JPEG or PNG only. */
export function sniffProofImage(buf: Buffer): Ext | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

export type ProofInput = { photo?: Buffer | null; signature?: Buffer | null };
export type ProofSummary = { taskId: string; hasPhoto: boolean; hasSignature: boolean; capturedAt: string };
type Viewer = { id: string; role: string };

/**
 * Proof of delivery. The assigned rider attaches a photo and/or the customer's signature to their own customer leg; the
 * files are stored in the private folder and are readable only by the staff who may (admins of operations and support,
 * the warehouse staff of the task's warehouse), through an authorized route or a 5-minute signed link. The delivery
 * code stays the authoritative check and proof is optional: a delivery with none completes exactly as before.
 */
@Injectable()
export class DeliveryProofService {
  constructor(
    @InjectRepository(DeliveryProof) private readonly proofs: Repository<DeliveryProof>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  // ── Rider: attach ───────────────────────────────────────────────────────────
  /** Validate everything first, then write the files, then the row; replaced files are deleted last. */
  async attach(riderId: string, taskId: string, input: ProofInput): Promise<ProofSummary> {
    const parts: { part: ProofPart; buf: Buffer; ext: Ext }[] = [];
    if (input.photo?.length) parts.push({ part: 'photo', buf: input.photo, ext: this.checkImage(input.photo, 'photo', MAX_PHOTO_BYTES, ['jpg', 'png']) });
    if (input.signature?.length) parts.push({ part: 'signature', buf: input.signature, ext: this.checkImage(input.signature, 'signature', MAX_SIGNATURE_BYTES, ['png']) });
    if (!parts.length) throw new BadRequestException('Add a photo or a signature.');

    const task = /^[0-9a-f-]{36}$/.test(taskId) ? await this.tasks.findOne({ where: { id: taskId } }) : null;
    // Same answer for "missing" and "someone else's" so task ids can't be probed.
    if (!task || !riderId || task.riderId !== riderId) throw new NotFoundException('Delivery task not found.');
    if (!PROOF_KINDS.includes(task.kind ?? 'delivery')) throw new BadRequestException('Proof of delivery is only taken on a delivery to the customer.');
    const open = task.status === 'picked_up' || task.status === 'in_transit';
    const recent = task.status === 'delivered' && !!task.deliveredAt && Date.now() - task.deliveredAt.getTime() <= LATE_PROOF_MS;
    if (!open && !recent) throw new BadRequestException('Proof can only be added while the delivery is under way.');

    mkdirSync(proofDir(), { recursive: true });
    const written: string[] = [];
    const replaced: string[] = [];
    try {
      let row = await this.proofs.findOne({ where: { taskId: task.id } });
      if (!row) row = this.proofs.create({ taskId: task.id, orderId: task.orderId, riderId, photoFile: null, photoMime: null, signatureFile: null, signatureMime: null });
      for (const p of parts) {
        const name = `${randomUUID()}.${p.ext}`;
        writeFileSync(join(proofDir(), name), p.buf);
        written.push(name);
        const old = p.part === 'photo' ? row.photoFile : row.signatureFile;
        if (old) replaced.push(old);
        if (p.part === 'photo') Object.assign(row, { photoFile: name, photoMime: MIME[p.ext] });
        else Object.assign(row, { signatureFile: name, signatureMime: MIME[p.ext] });
      }
      row.riderId = riderId;
      const saved = await this.proofs.save(row);
      for (const old of replaced) this.remove(old);
      return this.summary(saved);
    } catch (e) {
      for (const name of written) this.remove(name);
      throw e;
    }
  }

  private checkImage(buf: Buffer, label: ProofPart, max: number, allowed: Ext[]): Ext {
    if (buf.length > max) throw new BadRequestException(`The ${label} is too large (${Math.round(max / 1024 / 1024 * 10) / 10} MB at most).`);
    const ext = sniffProofImage(buf);
    if (!ext || !allowed.includes(ext)) throw new BadRequestException(`The ${label} must be a ${allowed.length === 1 ? 'PNG' : 'JPEG or PNG'} image.`);
    return ext;
  }

  private summary(r: DeliveryProof): ProofSummary {
    return { taskId: r.taskId, hasPhoto: !!r.photoFile, hasSignature: !!r.signatureFile, capturedAt: (r.updatedAt ?? r.createdAt ?? new Date()).toISOString() };
  }

  private remove(name: string) {
    try {
      const path = join(proofDir(), basename(name));
      if (existsSync(path)) unlinkSync(path);
    } catch {
      /* an orphan file in a private folder is harmless */
    }
  }

  // ── Staff: read ─────────────────────────────────────────────────────────────
  /** May this account see the proof of this task? */
  async canView(user: Viewer, task: Pick<DeliveryTask, 'hubId' | 'fromHubId' | 'toHubId'>): Promise<boolean> {
    if (PROOF_ADMINS.includes(user.role)) return true;
    if (user.role !== 'warehouse_staff') return false;
    const row = await this.users.findOne({ where: { id: user.id }, select: ['id', 'hubId', 'active'] });
    if (!row?.hubId || row.active === false) return false;
    return [task.hubId, task.fromHubId, task.toHubId].includes(row.hubId);
  }

  /** Proof exists only for a delivered leg (a photo taken before a refused code is not a proof of anything). */
  private async visible(user: Viewer, taskId: string): Promise<{ task: DeliveryTask; row: DeliveryProof | null }> {
    const task = /^[0-9a-f-]{36}$/.test(taskId ?? '') ? await this.tasks.findOne({ where: { id: taskId } }) : null;
    // Same answer for "no such task" and "not yours to see".
    if (!task || !(await this.canView(user, task))) throw new NotFoundException('Delivery task not found.');
    const row = task.status === 'delivered' ? await this.proofs.findOne({ where: { taskId: task.id } }) : null;
    return { task, row: row && (row.photoFile || row.signatureFile) ? row : null };
  }

  /** What exists for a task: `null` when the delivery has no proof. */
  async describe(user: Viewer, taskId: string): Promise<(ProofSummary & { riderId: string }) | null> {
    const { row } = await this.visible(user, taskId);
    return row ? { ...this.summary(row), riderId: row.riderId } : null;
  }

  async open(user: Viewer, taskId: string, part: string): Promise<{ path: string; mime: string; name: string }> {
    if (!(PROOF_PARTS as readonly string[]).includes(part)) throw new NotFoundException('File not found.');
    const { row } = await this.visible(user, taskId);
    const file = part === 'photo' ? row?.photoFile : row?.signatureFile;
    const mime = part === 'photo' ? row?.photoMime : row?.signatureMime;
    const path = file ? join(proofDir(), basename(file)) : null;
    if (!file || !mime || !path || !existsSync(path)) throw new NotFoundException('File not found.');
    return { path, mime, name: `${part}-${taskId}.${mime === 'image/png' ? 'png' : 'jpg'}` };
  }

  readFile(path: string): Buffer {
    return readFileSync(path);
  }

  // ── Signed links (an <img> tag cannot send a header) ─────────────────────────
  private get secret(): string {
    return `${this.config.get<string>('jwt.secret') ?? 'dev'}:delivery-proof`;
  }

  private sign(taskId: string, part: string, uid: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${taskId}.${part}.${uid}.${exp}`).digest('hex');
  }

  /** Links that open each existing part for 5 minutes, made only for an account that may read them. */
  async links(user: Viewer, taskId: string, origin: string): Promise<{ photoUrl: string | null; signatureUrl: string | null; capturedAt: string; expiresAt: string } | null> {
    const { row } = await this.visible(user, taskId);
    if (!row) return null;
    const exp = Date.now() + LINK_TTL_MS;
    const url = (part: ProofPart) =>
      `${origin.replace(/\/$/, '')}/api/v1/delivery-proofs/${taskId}/${part}?uid=${encodeURIComponent(user.id)}&exp=${exp}&sig=${this.sign(taskId, part, user.id, exp)}`;
    return {
      photoUrl: row.photoFile ? url('photo') : null,
      signatureUrl: row.signatureFile ? url('signature') : null,
      capturedAt: this.summary(row).capturedAt,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  /** The account a valid signed link was made for (null when the signature or the date is wrong). */
  verifyLink(taskId: string, part: string, uid: string, exp: number, sig: string): string | null {
    if (!uid || !Number.isFinite(exp) || exp < Date.now() || !/^[0-9a-f]{64}$/.test(sig ?? '')) return null;
    const want = Buffer.from(this.sign(taskId, part, uid, exp));
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want) ? uid : null;
  }
}
