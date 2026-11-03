import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, Hub, HubOpsSettings } from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { str } from '../common/validate';
import { DEFAULT_HUB_OPS, EDITABLE_HUB_OPS, HubOps, isWorkingNow, mergeHubOps } from './hub-ops-rules';
import { Actor } from './logistics.service';
import { tierAllows } from './tiers';

/** Admin roles that run warehouses (the same two that edit the hub directory). */
export const HUB_OPS_ADMINS = ['admin', 'admin_operations'];

/** What clients get: the settings, whether they are still the defaults, whether the warehouse is open now, who last saved. */
export type HubOpsView = HubOps & { hubId: string; isDefault: boolean; openNow: boolean; updatedAt: Date | null; updatedByName: string | null };

const toOps = (row: HubOpsSettings): HubOps => ({
  workStart: row.workStart,
  workEnd: row.workEnd,
  workDays: String(row.workDays ?? '')
    .split(',')
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
  timezone: row.timezone,
  batchSize: row.batchSize,
  autoAssign: !!row.autoAssign,
  autoAssignRule: (row.autoAssignRule as HubOps['autoAssignRule']) ?? 'least_busy',
  agedLevels: [row.agedLevel1Hours, row.agedLevel2Hours, row.agedLevel3Hours],
  deliveryTargetHours: row.deliveryTargetHours,
});

/**
 * Per-warehouse operating settings: read by the desk, the aged-parcel job, auto-assignment, batches and analytics; edited by
 * the warehouse's manager (and by operations admins), validated here and audited. A warehouse that never saved settings
 * runs on {@link DEFAULT_HUB_OPS}.
 */
@Injectable()
export class HubOpsSettingsService {
  constructor(
    @InjectRepository(HubOpsSettings) private readonly repo: Repository<HubOpsSettings>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** The settings in force at a warehouse (defaults when none were saved). */
  async ops(hubId: string | null | undefined): Promise<HubOps> {
    if (!hubId) return DEFAULT_HUB_OPS;
    const row = await this.repo.findOne({ where: { hubId } });
    return row ? toOps(row) : DEFAULT_HUB_OPS;
  }

  /** Every saved row by warehouse (for the scheduled job, which reads them once per run). */
  async allSaved(): Promise<Map<string, HubOps>> {
    return new Map((await this.repo.find()).map((r) => [r.hubId, toOps(r)]));
  }

  async view(hubId: string): Promise<HubOpsView> {
    const row = await this.repo.findOne({ where: { hubId } });
    const ops = row ? toOps(row) : DEFAULT_HUB_OPS;
    return { ...ops, hubId, isDefault: !row, openNow: isWorkingNow(ops), updatedAt: row?.updatedAt ?? null, updatedByName: row?.updatedByName ?? null };
  }

  /** May this person change the settings of this warehouse? Operations admins any; a manager only their own. */
  canEdit(actor: Actor, hubId: string): boolean {
    if (HUB_OPS_ADMINS.includes(actor.role)) return true;
    return actor.role === 'warehouse_staff' && !!actor.hubId && actor.hubId === hubId && tierAllows(actor.role, actor.tier, 'manage');
  }

  /** Validate, save, audit and announce a change. Only the fields in {@link EDITABLE_HUB_OPS} are read. */
  async update(actor: Actor, hubIdRaw: unknown, patch: unknown): Promise<HubOpsView> {
    const hubId = str(hubIdRaw, 'Warehouse', { max: 64 });
    if (!this.canEdit(actor, hubId)) throw new Error('Only the warehouse manager or an operations admin can change these settings.');
    const hub = await this.hubs.findOne({ where: { id: hubId } });
    if (!hub) throw new Error('Warehouse not found.');
    const before = await this.ops(hubId);
    const next = mergeHubOps(before, patch);
    const changed = EDITABLE_HUB_OPS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
    const row = (await this.repo.findOne({ where: { hubId } })) ?? this.repo.create({ hubId });
    Object.assign(row, {
      workStart: next.workStart,
      workEnd: next.workEnd,
      workDays: next.workDays.join(','),
      timezone: next.timezone,
      batchSize: next.batchSize,
      autoAssign: next.autoAssign,
      autoAssignRule: next.autoAssignRule,
      agedLevel1Hours: next.agedLevels[0],
      agedLevel2Hours: next.agedLevels[1],
      agedLevel3Hours: next.agedLevels[2],
      deliveryTargetHours: next.deliveryTargetHours,
      updatedById: actor.id,
      updatedByName: actor.name,
    } satisfies Partial<HubOpsSettings>);
    await this.repo.save(row);
    if (changed.length) {
      const detail = `${hub.name}: ${changed.map((k) => `${k} ${JSON.stringify(before[k])} -> ${JSON.stringify(next[k])}`).join('; ')}`.slice(0, 1000);
      await this.audits
        .save(this.audits.create({ actor: actor.name, role: actor.role, action: 'hub.settings.updated', entity: 'hub', entityId: hubId, detail }))
        .then((log) => this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log))
        .catch(() => undefined);
    }
    const out = await this.view(hubId);
    this.emitter.toHub(hubId, 'hubSettings:updated', out);
    this.emitter.toRoles(ADMIN_ROLES, 'hubSettings:updated', out);
    return out;
  }
}
