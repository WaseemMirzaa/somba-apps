import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { DELIVERY_KINDS, DeliveryTask, Hub, Order, User } from '../database/entities';
import { LogisticsService } from '../logistics/logistics.service';
import { CUSTOMER_KINDS } from '../logistics/leg-rules';
import { CoverageService } from '../geo/coverage.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Legs where the rider meets the customer. */
const CUSTOMER_LEGS: readonly string[] = [...CUSTOMER_KINDS, 'return_pickup', 'replacement_delivery'];

@Injectable()
export class RiderService {
  constructor(
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Hub)
    private readonly hubs: Repository<Hub>,
    private readonly logistics?: LogisticsService,
    private readonly coverage?: CoverageService,
  ) {}

  /**
   * Active riders of a warehouse with their open workload (for dispatch screens). Without `hubId` (admins) every
   * active rider.
   */
  async activeRiders(hubId?: string | null) {
    const riders = await this.users.find({ where: hubId ? { role: 'rider' as const, active: true, hubId } : { role: 'rider' as const, active: true } });
    if (!riders.length) return [];
    const open = await this.tasks.find({ where: { riderId: In(riders.map((r) => r.id)), status: In(['assigned', 'picked_up', 'in_transit']) }, select: ['id', 'riderId'] });
    return riders.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      hubId: r.hubId ?? null,
      activeTasks: open.filter((t) => t.riderId === r.id).length,
    }));
  }

  /** Where a rider works: their home warehouse (rider profile) and the areas it covers. */
  async assignment(riderId: string) {
    const me = await this.users.findOne({ where: { id: riderId } });
    const hub = me?.hubId ? await this.hubs.findOne({ where: { id: me.hubId } }) : null;
    const coverage = hub && this.coverage ? (await this.coverage.forHub(hub.id)).areas : [];
    return {
      hub: hub ? { id: hub.id, name: hub.name, city: hub.city, address: hub.address ?? null, lat: hub.lat ?? null, lng: hub.lng ?? null, areaId: hub.areaId ?? null, coverage } : null,
    };
  }

  /**
   * Work stats for a rider (grouped counts, not every task in memory). Riders are salaried: the platform pays nothing per
   * task, so there is no money here except `codCollectedUsd`, the company's cash the rider collected at the door.
   * `completed` counts every finished leg of any kind (customer deliveries, seller pickups, transfers, return legs).
   * "Today" and "the last 7 days" are UTC calendar days (the API stores and compares dates in UTC): the last 7 days are
   * today and the 6 days before it. `delivered` repeats `completed` for app versions that predate work stats.
   */
  async workStats(riderId: string, now: Date = new Date()) {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('t.kind', 'kind')
      .addSelect('COUNT(*)', 'n')
      .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'cod')
      .where('t.riderId = :riderId', { riderId })
      .groupBy('t.status')
      .addGroupBy('t.kind')
      .getRawMany<{ status: string; kind: string; n: string; cod: string }>();
    const sum = (list: { n: string }[]) => list.reduce((s, r) => s + Number(r.n), 0);
    const done = rows.filter((r) => r.status === 'delivered');
    const completed = sum(done);
    const failed = sum(rows.filter((r) => r.status === 'failed'));
    const active = sum(rows.filter((r) => r.status !== 'delivered' && r.status !== 'failed'));
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const since = (from: Date) => this.tasks.count({ where: { riderId, status: 'delivered', deliveredAt: MoreThanOrEqual(from) } });
    const [completedToday, completedLast7Days] = await Promise.all([since(startOfToday), since(new Date(startOfToday.getTime() - 6 * DAY_MS))]);
    const finished = completed + failed;
    return {
      totalTasks: sum(rows),
      completed,
      active,
      failed,
      completedToday,
      completedLast7Days,
      successRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
      byKind: DELIVERY_KINDS.map((kind) => ({ kind, count: sum(done.filter((r) => r.kind === kind)) })).filter((k) => k.count > 0),
      codCollectedUsd: Number(done.reduce((s, r) => s + Number(r.cod), 0).toFixed(2)),
      delivered: completed, // deprecated: old clients read this; drop it one release after the work-stats apps ship
    };
  }

  /** The order lines a customer leg carries, from its cargo (null for a legacy leg that carries the whole order). */
  private static cargoIds(t: DeliveryTask): Set<string> | null {
    if (!t.sellerIds) return null;
    try {
      const v = t.itemsJson ? (JSON.parse(t.itemsJson) as { orderItemId?: string }[]) : [];
      return new Set(v.map((x) => x?.orderItemId).filter((x): x is string => typeof x === 'string'));
    } catch {
      return null;
    }
  }

  /**
   * The rider's task list: ONLY the tasks the warehouse assigned to them (riders never pick from an open pool),
   * each with its leg (`kind`, `from`, `to`) and a snapshot of the order, so the rider app renders in one live call.
   */
  async queue(riderId: string) {
    const rows = await this.tasks.find({ where: { riderId }, order: { createdAt: 'DESC' }, take: 500 });
    const views = this.logistics ? await this.logistics.viewMany(rows) : [];
    const orderIds = [...new Set(rows.map((t) => t.orderId))];
    const orders = orderIds.length ? await this.orders.find({ where: { id: In(orderIds) } }) : [];
    const byId = new Map(orders.map((o) => [o.id, o]));
    return rows.map((t, i) => {
      const o = byId.get(t.orderId) ?? null;
      // A customer leg of a split order carries only some of the order's lines: the rider sees those (and that the order is partial).
      const cargo = RiderService.cargoIds(t);
      const live = (o?.items ?? []).filter((x) => x.fulfilment !== 'cancelled');
      const isCustomerLeg = (CUSTOMER_KINDS as readonly string[]).includes(t.kind);
      const items = !o ? [] : isCustomerLeg ? (cargo ? (o.items ?? []).filter((x) => cargo.has(x.id)) : (o.items ?? [])) : CUSTOMER_LEGS.includes(t.kind) || !t.sellerId ? (o.items ?? []) : (o.items ?? []).filter((x) => !x.sellerId || x.sellerId === t.sellerId);
      return {
        ...(views[i] ?? {}),
        id: t.id,
        orderId: t.orderId,
        orderReference: t.orderReference,
        status: t.status,
        hubId: t.hubId ?? null,
        codAmountUsd: t.codAmountUsd,
        address: t.address,
        lat: t.lat,
        lng: t.lng,
        pickupAddress: t.pickupAddress,
        attempts: t.attempts,
        failureReason: t.failureReason,
        readyAt: t.readyAt,
        receivedAt: t.receivedAt,
        createdAt: t.createdAt,
        order: o
          ? {
              reference: o.reference,
              // Only the legs that meet the customer show who and where; a pickup or a transfer shows the parcel.
              customerName: CUSTOMER_LEGS.includes(t.kind) ? o.customerName : (o.customerName ?? '').split(' ')[0],
              paymentMethod: o.paymentMethod,
              estimatedDeliveryDate: o.estimatedDeliveryDate ?? null,
              totalUsd: o.totalUsd,
              shippingAddress: CUSTOMER_LEGS.includes(t.kind) ? o.shippingAddress : null,
              items,
              /** True when this leg brings only part of the order (the rest was delivered before, or comes in another leg). */
              partial: isCustomerLeg && !!cargo && cargo.size < live.length,
            }
          : null,
      };
    });
  }
}
