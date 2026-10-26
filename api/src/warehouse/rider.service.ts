import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryTask, Hub, Order, User } from '../database/entities';
import { LogisticsService } from '../logistics/logistics.service';
import { CoverageService } from '../geo/coverage.service';

const PER_DELIVERY_USD = 2.5;
/** Legs where the rider meets the customer. */
const CUSTOMER_LEGS: readonly string[] = ['delivery', 'return_pickup', 'replacement_delivery'];

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

  /** Earnings + shift summary for a rider (grouped counts, not every task in memory). */
  async earnings(riderId: string) {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .addSelect('COALESCE(SUM(t.codAmountUsd), 0)', 'cod')
      .where('t.riderId = :riderId', { riderId })
      .groupBy('t.status')
      .getRawMany<{ status: string; n: string; cod: string }>();
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    const done = rows.find((r) => r.status === 'delivered');
    const delivered = Number(done?.n ?? 0);
    const active = rows.filter((r) => r.status !== 'delivered' && r.status !== 'failed').reduce((s, r) => s + Number(r.n), 0);
    return {
      totalTasks: total,
      delivered,
      active,
      codCollectedUsd: Number(Number(done?.cod ?? 0).toFixed(2)),
      earningsUsd: Number((delivered * PER_DELIVERY_USD).toFixed(2)),
    };
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
              items: CUSTOMER_LEGS.includes(t.kind) || !t.sellerId ? (o.items ?? []) : (o.items ?? []).filter((i) => !i.sellerId || i.sellerId === t.sellerId),
            }
          : null,
      };
    });
  }
}
