import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivateFile, RiderDocument, RiderVehicle, User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierAllows } from '../logistics/tiers';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../ops/audit.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PrivateFilesService } from '../sellers/private-files.service';
import {
  DOCUMENT_MIMES,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_RIDER,
  VEHICLE_FIELDS,
  expiryOf,
  parseDocumentInput,
  parseVehiclePatch,
  rejectionReason,
  type ExpiryState,
} from './rules';

/** The private-file kind of a rider compliance document. */
export const RIDER_DOC_KIND = 'rider_doc';

/** Admin roles that see and edit every rider's vehicle and documents (the ones that run fleet operations). */
export const RIDER_COMPLIANCE_ADMINS: readonly string[] = ['admin', 'admin_operations'];

export interface VehicleView {
  riderId: string;
  /** False until staff save the vehicle for the first time (every field is then null). */
  exists: boolean;
  model: string | null;
  type: string | null;
  plate: string | null;
  colour: string | null;
  odometerKm: number | null;
  fuel: string | null;
  insuranceValidUntil: string | null;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
  /** Insurance against today (UTC): `expired`, `expiring` (30 days or less) or `valid`; a warning only. */
  insurance: { state: ExpiryState; daysLeft: number | null };
  /** The next service against today: `expired` here means overdue. */
  service: { state: ExpiryState; daysLeft: number | null };
  updatedByName: string | null;
  updatedAt: Date | null;
}

export interface DocumentView {
  id: string;
  riderId: string;
  type: string;
  number: string | null;
  expiresOn: string | null;
  expiry: { state: ExpiryState; daysLeft: number | null };
  status: 'pending' | 'approved' | 'rejected';
  fileId: string;
  mime: string;
  size: number;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

const ONE_LINE = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Rider vehicle and compliance documents.
 *
 * - A rider reads their own vehicle and documents and uploads a document (the scan is a private file; the upload starts
 *   `pending`). They never edit the vehicle and never see anyone else's.
 * - Staff act within their reach: an operations admin on any rider, a warehouse supervisor or manager on the riders of their OWN
 *   warehouse. They edit the vehicle and approve or reject documents; every such write is audited (field NAMES and the decision,
 *   never the plate, the number or the file).
 * - Nothing here blocks a rider from working. An expired document is a warning on the views, nothing more.
 */
@Injectable()
export class RiderComplianceService implements OnModuleInit {
  constructor(
    @InjectRepository(RiderVehicle) private readonly vehicles: Repository<RiderVehicle>,
    @InjectRepository(RiderDocument) private readonly docs: Repository<RiderDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PrivateFile) private readonly files: Repository<PrivateFile>,
    private readonly audit: AuditService,
    private readonly emitter: RealtimeEmitter,
    @Optional() private readonly privateFiles?: PrivateFilesService,
    @Optional() private readonly notices?: NotificationsService,
  ) {}

  /** Staff open a rider's document scan through the existing `private:link` event: this says who may. */
  onModuleInit(): void {
    this.privateFiles?.registerReader(RIDER_DOC_KIND, (user, file) => this.staffMayOpenFile(user, file));
  }

  // ── Who may do what ────────────────────────────────────────────────────

  /** May this staff member act on this rider? Admins of fleet operations any; supervisors and managers their own warehouse's. */
  canManage(actor: Actor, rider: Pick<User, 'hubId'>): boolean {
    if (RIDER_COMPLIANCE_ADMINS.includes(actor.role)) return true;
    return actor.role === 'warehouse_staff' && !!actor.hubId && actor.hubId === (rider.hubId ?? null) && tierAllows(actor.role, actor.tier, 'oversee');
  }

  private async riderOf(riderId: string): Promise<User> {
    const rider = /^[0-9a-f-]{36}$/.test(riderId) ? await this.users.findOne({ where: { id: riderId } }) : null;
    if (!rider || rider.role !== 'rider') throw new Error('Rider not found.');
    return rider;
  }

  /** The rider a staff member may act on, or the sentence to show. A rider of another warehouse is "not found", not "forbidden". */
  private async riderFor(actor: Actor, riderId: unknown): Promise<User> {
    const rider = await this.riderOf(typeof riderId === 'string' ? riderId : '');
    if (this.canManage(actor, rider)) return rider;
    if (actor.role === 'warehouse_staff' && actor.hubId && actor.hubId === (rider.hubId ?? null)) {
      throw new Error('Only supervisors and managers can see or change rider documents.');
    }
    if (actor.role === 'warehouse_staff') throw new Error('Rider not found.');
    throw new Error('Not allowed.');
  }

  /** The caller of `private:link` / a download, resolved from the database (their warehouse and tier can change while connected). */
  private async staffMayOpenFile(user: { id: string; role: string }, file: PrivateFile): Promise<boolean> {
    try {
      const doc = await this.docs.findOne({ where: { fileId: file.id } });
      if (!doc) return false;
      const row = await this.users.findOne({ where: { id: user.id }, select: ['id', 'role', 'hubId', 'warehouseTier', 'active', 'name'] });
      if (!row || row.active === false) return false;
      await this.riderFor({ id: row.id, role: row.role, name: row.name, hubId: row.hubId ?? null, tier: row.warehouseTier ?? null }, doc.riderId);
      return true;
    } catch {
      return false;
    }
  }

  // ── Views ──────────────────────────────────────────────────────────────

  vehicleView(riderId: string, row: RiderVehicle | null, now: Date = new Date()): VehicleView {
    return {
      riderId,
      exists: !!row,
      model: row?.model ?? null,
      type: row?.type ?? null,
      plate: row?.plate ?? null,
      colour: row?.colour ?? null,
      odometerKm: row?.odometerKm ?? null,
      fuel: row?.fuel ?? null,
      insuranceValidUntil: row?.insuranceValidUntil ?? null,
      lastServiceOn: row?.lastServiceOn ?? null,
      nextServiceOn: row?.nextServiceOn ?? null,
      insurance: expiryOf(row?.insuranceValidUntil, now),
      service: expiryOf(row?.nextServiceOn, now),
      updatedByName: row?.updatedByName ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  documentView(d: RiderDocument, now: Date = new Date()): DocumentView {
    return {
      id: d.id,
      riderId: d.riderId,
      type: d.type,
      number: d.number ?? null,
      expiresOn: d.expiresOn ?? null,
      expiry: expiryOf(d.expiresOn, now),
      status: d.status,
      fileId: d.fileId,
      mime: d.mime,
      size: d.size,
      reviewedByName: d.reviewedByName ?? null,
      reviewedAt: d.reviewedAt ?? null,
      rejectionReason: d.rejectionReason ?? null,
      createdAt: d.createdAt,
    };
  }

  async vehicleOf(riderId: string, now: Date = new Date()): Promise<VehicleView> {
    return this.vehicleView(riderId, await this.vehicles.findOne({ where: { riderId } }), now);
  }

  async documentsOf(riderId: string, now: Date = new Date()): Promise<DocumentView[]> {
    const rows = await this.docs.find({ where: { riderId }, order: { createdAt: 'DESC' }, take: MAX_DOCUMENTS_PER_RIDER + 20 });
    return rows.map((d) => this.documentView(d, now));
  }

  // ── The rider ──────────────────────────────────────────────────────────

  /** A rider's own vehicle (read only). */
  mineVehicle(riderId: string, now?: Date): Promise<VehicleView> {
    return this.vehicleOf(riderId, now);
  }

  /** A rider's own documents, newest first. */
  mineDocuments(riderId: string, now?: Date): Promise<DocumentView[]> {
    return this.documentsOf(riderId, now);
  }

  /**
   * A rider submits a document. The scan was already stored by `POST /api/v1/private-uploads` (which accepts only JPEG, PNG, WebP or
   * PDF up to 5 MB by the file's real bytes); here it must be the rider's OWN file, a JPEG, a PNG or a PDF, and not already used
   * by another document. The row starts `pending`.
   */
  async upload(riderId: string, raw: unknown, now: Date = new Date()): Promise<DocumentView> {
    const rider = await this.riderOf(riderId);
    const input = parseDocumentInput(raw);
    if ((await this.docs.count({ where: { riderId: rider.id } })) >= MAX_DOCUMENTS_PER_RIDER) {
      throw new Error('You have reached the limit of documents. Ask your warehouse to review the ones you sent.');
    }
    const file = await this.files.findOne({ where: { id: input.fileId } });
    // Same answer for "no such file" and "someone else's", so file ids cannot be probed.
    if (!file || file.ownerUserId !== rider.id) throw new Error('Upload the file again and retry.');
    if (!DOCUMENT_MIMES.includes(file.mime)) throw new Error('Only JPEG, PNG or PDF files are accepted.');
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error('The file is too large (5 MB at most).');
    if (file.kind === RIDER_DOC_KIND || (await this.docs.count({ where: { fileId: file.id } })) > 0) throw new Error('This file was already sent. Upload a new one.');
    const row = await this.docs
      .save(this.docs.create({ riderId: rider.id, type: input.type, number: input.number, expiresOn: input.expiresOn, fileId: file.id, mime: file.mime, size: file.size, status: 'pending' }))
      .catch(() => {
        throw new Error('This file was already sent. Upload a new one.');
      });
    // From now on only the rider and the staff who may review it can open the scan.
    await this.files.update({ id: file.id }, { kind: RIDER_DOC_KIND });
    const view = this.documentView(row, now);
    this.emitter.toUser(rider.id, 'rider:document:updated', view);
    this.announce(rider);
    return view;
  }

  // ── Staff ──────────────────────────────────────────────────────────────

  /** A rider's vehicle and documents for the staff who may see them. `canEdit` is true for everyone who gets this far. */
  async staffView(actor: Actor, riderId: unknown, now: Date = new Date()) {
    const rider = await this.riderFor(actor, riderId);
    return { rider: { id: rider.id, name: rider.name, hubId: rider.hubId ?? null }, vehicle: await this.vehicleOf(rider.id, now), documents: await this.documentsOf(rider.id, now), canEdit: true };
  }

  /** Edit the rider's vehicle: validated, saved, audited (field names only) and announced. Only the keys sent change; null clears. */
  async updateVehicle(actor: Actor, riderId: unknown, patchRaw: unknown, now: Date = new Date()): Promise<VehicleView> {
    const rider = await this.riderFor(actor, riderId);
    const patch = parseVehiclePatch(patchRaw);
    const row = (await this.vehicles.findOne({ where: { riderId: rider.id } })) ?? this.vehicles.create({ riderId: rider.id });
    const changed = VEHICLE_FIELDS.filter((k) => k in patch && (row[k] ?? null) !== (patch[k] ?? null));
    if (!changed.length && row.id) return this.vehicleView(rider.id, row, now);
    Object.assign(row, patch, { updatedById: actor.id, updatedByName: actor.name.slice(0, 100) });
    const saved = await this.vehicles.save(row);
    await this.audit.record({
      actor: actor.name,
      role: actor.role,
      action: 'rider.vehicle.updated',
      entity: 'rider_vehicle',
      entityId: saved.id,
      detail: `rider ${rider.id}: ${changed.length ? changed.join(', ') : 'created'}`,
    });
    const view = this.vehicleView(rider.id, saved, now);
    this.emitter.toUser(rider.id, 'rider:vehicle:updated', view);
    this.announce(rider);
    return view;
  }

  /** Approve a document, or reject it with a reason the rider reads. Audited; the rider is told. */
  async review(actor: Actor, documentId: unknown, decision: unknown, reason?: unknown, now: Date = new Date()): Promise<DocumentView> {
    const id = typeof documentId === 'string' && /^[0-9a-f-]{36}$/.test(documentId) ? documentId : '';
    const doc = id ? await this.docs.findOne({ where: { id } }) : null;
    if (!doc) throw new Error('Document not found.');
    const rider = await this.riderFor(actor, doc.riderId);
    if (decision !== 'approve' && decision !== 'reject') throw new Error('Decision must be approve or reject.');
    const next = decision === 'approve' ? 'approved' : 'rejected';
    const why = decision === 'reject' ? rejectionReason(reason) : null;
    if (doc.status === next && decision === 'approve') throw new Error('This document is already approved.');
    Object.assign(doc, { status: next, reviewedById: actor.id, reviewedByName: actor.name.slice(0, 100), reviewedAt: now, rejectionReason: why });
    const saved = await this.docs.save(doc);
    await this.audit.record({
      actor: actor.name,
      role: actor.role,
      action: decision === 'approve' ? 'rider.document.approved' : 'rider.document.rejected',
      entity: 'rider_document',
      entityId: saved.id,
      detail: `${saved.type} of rider ${rider.id}${why ? `: ${ONE_LINE(why)}` : ''}`.slice(0, 500),
    });
    const view = this.documentView(saved, now);
    this.emitter.toUser(rider.id, 'rider:document:updated', view);
    this.announce(rider);
    void this.tellRider(rider.id, saved.type, next, why);
    return view;
  }

  /** Open admin and warehouse pages refresh (no personal data in the payload: an id). */
  private announce(rider: User): void {
    const payload = { riderId: rider.id };
    this.emitter.toRoles([...RIDER_COMPLIANCE_ADMINS], 'riderCompliance:updated', payload);
    if (rider.hubId) this.emitter.toHub(rider.hubId, 'riderCompliance:updated', payload);
  }

  private async tellRider(riderId: string, type: string, status: 'approved' | 'rejected', why: string | null): Promise<void> {
    if (!this.notices) return;
    const name = DOC_NAME[type] ?? DOC_NAME.other;
    const ok = status === 'approved';
    // The French text comes from `notifications/localize.ts` (the notice-coverage spec checks every sentence is there).
    await this.notices
      .toUser(riderId, {
        title: ok ? 'Document approved' : 'Document rejected',
        body: ok ? `Your ${name} was approved.` : `Your ${name} was rejected: ${why}`,
        type: 'system',
      })
      .catch(() => undefined);
  }
}

/** How the English notices name a document (`localize.ts` has the French). */
const DOC_NAME: Record<string, string> = {
  driver_licence: 'driver licence',
  vehicle_insurance: 'vehicle insurance',
  vehicle_registration: 'vehicle registration',
  id_card: 'ID',
  other: 'document',
};
