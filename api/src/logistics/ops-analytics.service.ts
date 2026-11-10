import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryTask, User } from '../database/entities';
import { DEFAULT_HUB_OPS, isVoidedFailure } from './hub-ops-rules';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { isCustomerKind, isHubBound } from './leg-rules';

const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const BATCH = 5000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date filter bound (UTC): a bare date is the start of that day, or for `to` the very end of it. */
function bound(v: unknown, label: string, end: boolean): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new Error(`${label} must be a date like 2026-11-03.`);
  const t = v.trim();
  const d = DATE_ONLY.test(t) ? new Date(`${t}T${end ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} must be a date like 2026-11-03.`);
  return d;
}

/** The date range of an analytics request: both bounds optional (default: the last 30 days), at most a year, `from` before `to`. */
export function rangeOf(input: { from?: unknown; to?: unknown } | null | undefined, now: Date = new Date()): { from: Date; to: Date; days: number } {
  const to = bound(input?.to, 'End date', true) ?? now;
  // The default is the last 30 days: today (so far) and the 29 whole days before it.
  const from = bound(input?.from, 'Start date', false) ?? new Date(Math.floor(to.getTime() / DAY_MS) * DAY_MS - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (from.getTime() > to.getTime()) throw new Error('The start date must be before the end date.');
  const days = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  if (days > MAX_RANGE_DAYS) throw new Error(`Choose a period of at most ${MAX_RANGE_DAYS} days.`);
  return { from, to, days: Math.max(1, days) };
}

const round = (n: number, d = 1) => Number(n.toFixed(d));
const pct = (num: number, den: number): number | null => (den > 0 ? round((num / den) * 100) : null);
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface LegStat {
  kind: string;
  completed: number;
  failed: number;
  /** Average hours from the leg opening to its completion. Null when no leg of this kind completed. */
  avgHours: number | null;
  /** Average minutes from the rider collecting to the hand-over (legs a rider finishes). Null without both stamps. */
  avgTransitMinutes: number | null;
}

export interface RiderStat {
  riderId: string;
  name: string;
  completed: number;
  failed: number;
  /** completed / (completed + failed), percent. Null before any leg is closed. */
  successRatePct: number | null;
}

export interface OpsAnalytics {
  hubId: string | null;
  range: { from: Date; to: Date; days: number };
  /** The warehouse's delivery-time target in hours (null for the all-warehouses view, where each leg uses its own warehouse's). */
  targetHours: number | null;
  onTime: { deliveries: number; onTime: number; late: number; ratePct: number | null };
  legs: LegStat[];
  riders: RiderStat[];
  totals: { completed: number; failed: number; voided: number };
}

/**
 * Warehouse analytics, counts and times only: riders are salaried, so nothing here measures pay.
 *
 *  - on-time rate: customer deliveries completed in the period that were handed over within the warehouse's delivery-time target
 *    of the leg opening at the warehouse;
 *  - average time per leg, by kind (opening to completion; hand-over for the legs a rider finishes);
 *  - per rider: legs completed, legs failed, success rate. A leg closed by the system or by staff (order cancelled, returned to
 *    the seller, missing from a run) is not the rider's failure and is counted apart.
 *
 * A leg belongs to the warehouse that manages it. "Completed" means delivered (for a leg that ends at a warehouse, scanned in).
 */
@Injectable()
export class OpsAnalyticsService {
  constructor(
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly hubOps: HubOpsSettingsService,
  ) {}

  async legs(hubId: string | null, input: { from?: unknown; to?: unknown } | null | undefined, now: Date = new Date()): Promise<OpsAnalytics> {
    const range = rangeOf(input, now);
    const saved = await this.hubOps.allSaved();
    const targetOf = (id: string | null) => (id ? (saved.get(id) ?? DEFAULT_HUB_OPS).deliveryTargetHours : DEFAULT_HUB_OPS.deliveryTargetHours);

    const kinds = new Map<string, { completed: number; failed: number; hours: number[]; transit: number[] }>();
    const riders = new Map<string, { completed: number; failed: number }>();
    const totals = { completed: 0, failed: 0, voided: 0 };
    let deliveries = 0;
    let onTime = 0;

    const done = 'COALESCE(t.deliveredAt, t.updatedAt)';
    for (let skip = 0; ; skip += BATCH) {
      const qb = this.tasks
        .createQueryBuilder('t')
        .select(['t.id', 't.kind', 't.status', 't.riderId', 't.hubId', 't.createdAt', 't.deliveredAt', 't.updatedAt', 't.pickedUpAt', 't.failureReason'])
        .where("t.status IN ('delivered','failed')")
        .andWhere(`${done} >= :from AND ${done} <= :to`, { from: range.from, to: range.to });
      if (hubId) qb.andWhere('t.hubId = :hubId', { hubId });
      const page = await qb.orderBy('t.id', 'ASC').take(BATCH).skip(skip).getMany();
      for (const t of page) {
        const k = kinds.get(t.kind) ?? { completed: 0, failed: 0, hours: [], transit: [] };
        kinds.set(t.kind, k);
        if (t.status === 'delivered') {
          const end = (t.deliveredAt ?? t.updatedAt).getTime();
          totals.completed++;
          k.completed++;
          k.hours.push(Math.max(0, (end - t.createdAt.getTime()) / 3_600_000));
          if (t.pickedUpAt && t.deliveredAt && !isHubBound(t.kind)) k.transit.push(Math.max(0, (t.deliveredAt.getTime() - t.pickedUpAt.getTime()) / 60_000));
          if (isCustomerKind(t.kind)) {
            deliveries++;
            if ((end - t.createdAt.getTime()) / 3_600_000 <= targetOf(t.hubId)) onTime++;
          }
          if (t.riderId) riders.set(t.riderId, { ...(riders.get(t.riderId) ?? { completed: 0, failed: 0 }), completed: (riders.get(t.riderId)?.completed ?? 0) + 1 });
        } else if (isVoidedFailure(t.failureReason)) {
          totals.voided++;
        } else {
          totals.failed++;
          k.failed++;
          if (t.riderId) riders.set(t.riderId, { completed: riders.get(t.riderId)?.completed ?? 0, failed: (riders.get(t.riderId)?.failed ?? 0) + 1 });
        }
      }
      if (page.length < BATCH) break;
    }

    const names = riders.size ? new Map((await this.users.find({ where: { id: In([...riders.keys()]) }, select: ['id', 'name'] })).map((u) => [u.id, u.name])) : new Map<string, string>();
    return {
      hubId,
      range,
      targetHours: hubId ? targetOf(hubId) : null,
      onTime: { deliveries, onTime, late: deliveries - onTime, ratePct: pct(onTime, deliveries) },
      legs: [...kinds.entries()]
        .map(([kind, k]) => ({
          kind,
          completed: k.completed,
          failed: k.failed,
          avgHours: avg(k.hours) === null ? null : round(avg(k.hours) as number),
          avgTransitMinutes: avg(k.transit) === null ? null : round(avg(k.transit) as number),
        }))
        .sort((a, b) => b.completed + b.failed - (a.completed + a.failed) || a.kind.localeCompare(b.kind)),
      riders: [...riders.entries()]
        .map(([riderId, r]) => ({ riderId, name: names.get(riderId) ?? 'Rider', completed: r.completed, failed: r.failed, successRatePct: pct(r.completed, r.completed + r.failed) }))
        .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name)),
      totals,
    };
  }
}
