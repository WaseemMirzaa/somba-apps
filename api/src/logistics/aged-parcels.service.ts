import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AgedAlert, DeliveryTask, User } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_HUB_OPS, HubOps, LAST_LEVEL, ageHours, dueLevels } from './hub-ops-rules';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { OPEN_STATUSES, kindLabel } from './leg-rules';
import { tasksOfHub } from './hub-scope';
import { tierOf } from './tiers';

const PAGE = 500;

export interface SweepResult {
  /** Open legs old enough for at least one alert level that the job looked at. */
  checked: number;
  /** Alert levels raised (one per parcel at most per run: the highest newly due). */
  alerted: number;
  /** Levels recorded without telling anyone because a higher one was due at the same time. */
  skipped: number;
}

/** A unique-key clash from either database (a second run claimed the level first). */
const isDuplicate = (e: unknown): boolean => /UNIQUE|Duplicate entry|ER_DUP_ENTRY|SQLITE_CONSTRAINT/i.test(String((e as Error)?.message ?? e)) || (e as { code?: string })?.code === 'ER_DUP_ENTRY';

/**
 * Aged-parcel alerts. A leg that stays open longer than a warehouse's configured ages (defaults 24 / 48 / 72 hours) raises
 * level 1, 2 and 3: levels 1 and 2 tell the warehouse's supervisors (in-app and push); level 3, the last, escalates to the
 * warehouse's manager and to the admins.
 *
 * Idempotent: a level is claimed by inserting its `aged_alerts` row (unique per parcel and level), so running the sweep twice, from
 * two API instances, or after a restart tells nobody twice. A parcel first seen already past several levels records the lower ones
 * silently and alerts once, at the highest. Closing a leg stops its alerts (only open legs are swept).
 */
@Injectable()
export class AgedParcelsService {
  private readonly logger = new Logger(AgedParcelsService.name);

  constructor(
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(AgedAlert) private readonly alerts: Repository<AgedAlert>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly hubOps: HubOpsSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Raise every alert level that has become due. `now` is injectable so tests (and the smoke) can move the clock. */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const saved = await this.hubOps.allSaved();
    const opsOf = (hubId: string | null): HubOps => (hubId ? (saved.get(hubId) ?? DEFAULT_HUB_OPS) : DEFAULT_HUB_OPS);
    // Nothing younger than the shortest level 1 anywhere can be due.
    const shortest = Math.min(DEFAULT_HUB_OPS.agedLevels[0], ...[...saved.values()].map((o) => o.agedLevels[0]));
    const cutoff = new Date(now.getTime() - shortest * 3_600_000);
    const out: SweepResult = { checked: 0, alerted: 0, skipped: 0 };
    for (let skip = 0; ; skip += PAGE) {
      const page = await this.tasks.find({ where: { status: In([...OPEN_STATUSES]), createdAt: LessThanOrEqual(cutoff) }, order: { createdAt: 'ASC', id: 'ASC' }, take: PAGE, skip });
      if (!page.length) break;
      const done = await this.alerts.find({ where: { taskId: In(page.map((t) => t.id)) }, select: ['taskId', 'level'] });
      const seen = new Map<string, Set<number>>();
      for (const a of done) seen.set(a.taskId, (seen.get(a.taskId) ?? new Set()).add(a.level));
      for (const task of page) {
        const age = ageHours(task.createdAt, now);
        const due = dueLevels(age, opsOf(task.hubId).agedLevels);
        if (!due.length) continue;
        out.checked++;
        // The highest due level is the one that alerts, and it is claimed first: of any number of runs racing for the same
        // parcel, exactly one inserts that row and tells people. The lower levels it passed are then recorded silently.
        const top = Math.max(...due);
        if (seen.get(task.id)?.has(top)) continue;
        try {
          await this.alerts.insert({ taskId: task.id, hubId: task.hubId ?? null, level: top, ageHours: Math.round(age * 10) / 10, notified: 0 });
        } catch (e) {
          if (!isDuplicate(e)) throw e; // another run got this level first: it tells the people
          continue;
        }
        for (const level of due.filter((l) => l < top && !seen.get(task.id)?.has(l))) {
          await this.alerts.insert({ taskId: task.id, hubId: task.hubId ?? null, level, ageHours: Math.round(age * 10) / 10, notified: 0 }).then(
            () => void out.skipped++,
            (e) => {
              if (!isDuplicate(e)) throw e;
            },
          );
        }
        const told = await this.tell(task, top, age).catch((e) => {
          this.logger.warn(`aged alert ${task.id} level ${top} failed: ${(e as Error).message}`);
          return 0;
        });
        await this.alerts.update({ taskId: task.id, level: top }, { notified: told });
        out.alerted++;
      }
      if (page.length < PAGE) break;
    }
    return out;
  }

  /** Staff of a warehouse of exactly this tier. */
  private async staffOfTier(hubId: string, tier: 'supervisor' | 'manager'): Promise<string[]> {
    const rows = await this.users.find({ where: { role: 'warehouse_staff', active: true, hubId }, select: ['id', 'warehouseTier'] });
    return rows.filter((u) => tierOf(u.warehouseTier) === tier).map((u) => u.id);
  }

  /**
   * Tell the right people about a level: supervisors for 1 and 2 (the managers if the warehouse has none), the manager and every
   * admin for the last. Returns how many people were told.
   */
  private async tell(task: DeliveryTask, level: number, age: number): Promise<number> {
    const hours = Math.floor(age);
    const what = kindLabel(task.kind);
    const last = level >= LAST_LEVEL;
    const hubId = task.hubId;
    let ids: string[] = [];
    if (hubId) {
      const supervisors = await this.staffOfTier(hubId, 'supervisor');
      const managers = await this.staffOfTier(hubId, 'manager');
      ids = last ? (managers.length ? managers : supervisors) : supervisors.length ? supervisors : managers;
    }
    const notice = {
      title: last ? 'Parcel escalated' : 'Aged parcel',
      body: last ? `${task.orderReference}: ${what} has been open for ${hours} hours and needs a decision.` : `${task.orderReference}: ${what} has been open for ${hours} hours.`,
      type: 'task',
      entityId: task.id,
      extra: { orderId: task.orderId, kind: task.kind, agedLevel: String(level) },
    };
    if (ids.length) await this.notifications.toUsers(ids, notice);
    // The last level goes to the admins too; a parcel no warehouse manages has nobody else to tell.
    if (last || !hubId) await this.notifications.toAdmins(notice, 'logisticsDesk');
    return ids.length + (last || !hubId ? 1 : 0);
  }

  /**
   * What the aged-parcels page shows next to each leg: the highest level it has reached against ITS warehouse's ages, when that
   * alert went out, and the ages themselves. `hubId` null = every warehouse (admins).
   */
  async summary(hubId: string | null, now: Date = new Date()): Promise<{
    levels: [number, number, number];
    byTask: Record<string, { level: number; alertedAt: Date | null }>;
    counts: [number, number, number];
  }> {
    const ops = hubId ? await this.hubOps.ops(hubId) : DEFAULT_HUB_OPS;
    const saved = await this.hubOps.allSaved();
    const open = await this.tasks.find({ where: tasksOfHub({ status: In([...OPEN_STATUSES]) }, hubId), select: ['id', 'hubId', 'createdAt'], order: { createdAt: 'ASC' }, take: 2000 });
    const alerts = open.length ? await this.alerts.find({ where: { taskId: In(open.map((t) => t.id)) } }) : [];
    const counts: [number, number, number] = [0, 0, 0];
    const byTask: Record<string, { level: number; alertedAt: Date | null }> = {};
    for (const t of open) {
      const levels = (hubId ? ops : t.hubId ? (saved.get(t.hubId) ?? DEFAULT_HUB_OPS) : DEFAULT_HUB_OPS).agedLevels;
      const level = dueLevels(ageHours(t.createdAt, now), levels).length;
      if (!level) continue;
      counts[level - 1]++;
      const mine = alerts.filter((a) => a.taskId === t.id);
      const top = mine.sort((a, b) => b.level - a.level)[0];
      byTask[t.id] = { level, alertedAt: top?.createdAt ?? null };
    }
    return { levels: ops.agedLevels, byTask, counts };
  }
}
