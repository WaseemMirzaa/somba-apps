import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DeliveryTask, Hub, Order, Setting, User } from '../database/entities';
import { parsePreferredZones, tasksOfHub } from '../common/zones/hub-scope';
import { parseZones } from '../common/zones/zone-match';

const PER_DELIVERY_USD = 2.5;

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
    @InjectRepository(Setting)
    private readonly settings: Repository<Setting>,
  ) {}

  /**
   * Active rider accounts with their open workload (for dispatch screens). With `hubId`, only that warehouse's
   * riders and riders not tied to a warehouse.
   */
  async activeRiders(hubId?: string | null) {
    const where = hubId
      ? [
          { role: 'rider' as const, active: true, hubId },
          { role: 'rider' as const, active: true, hubId: IsNull() },
        ]
      : { role: 'rider' as const, active: true };
    const riders = await this.users.find({ where });
    const open = await this.tasks.find({ where: { status: In(['assigned', 'picked_up', 'in_transit']) } });
    return riders.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      hubId: r.hubId ?? null,
      preferredZones: parsePreferredZones(r.preferredZones),
      activeTasks: open.filter((t) => t.riderId === r.id).length,
    }));
  }

  /** Zone id → display name, from the deliveryZones setting. */
  private async zoneNames(): Promise<Map<string, string>> {
    const row = await this.settings.findOne({ where: { key: 'deliveryZones' } });
    return new Map(parseZones(row?.value).map((z) => [z.id, z.name]));
  }

  /** Where a rider works: home warehouse and preferred zones (rider profile, "My zone"). */
  async assignment(riderId: string) {
    const me = await this.users.findOne({ where: { id: riderId } });
    const hub = me?.hubId ? await this.hubs.findOne({ where: { id: me.hubId } }) : null;
    const names = await this.zoneNames();
    const row = await this.settings.findOne({ where: { key: 'deliveryZones' } });
    const hubZones = hub ? parseZones(row?.value).filter((z) => z.hubId === hub.id) : [];
    return {
      hub: hub ? { id: hub.id, name: hub.name, city: hub.city, address: hub.address ?? null } : null,
      preferredZones: parsePreferredZones(me?.preferredZones).map((id) => ({ id, name: names.get(id) ?? id })),
      hubZones: hubZones.map((z) => ({ id: z.id, name: z.name })),
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
   * The rider's delivery queue — their assigned tasks plus anything still
   * unassigned — each enriched with a snapshot of the order (customer, items,
   * payment) so the rider app renders in one live call.
   */
  async queue(riderId: string) {
    // The open pool is limited to the rider's own warehouse (plus tasks not tied to one); preferred zones first.
    const me = await this.users.findOne({ where: { id: riderId }, select: ['id', 'hubId', 'preferredZones'] });
    const pool = tasksOfHub({ status: 'unassigned' }, me?.hubId ?? null);
    const rows = await this.tasks.find({
      where: [{ riderId }, ...(Array.isArray(pool) ? pool : [pool])],
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const preferred = new Set(parsePreferredZones(me?.preferredZones));
    if (preferred.size) {
      rows.sort((a, b) => Number(!!b.zoneId && preferred.has(b.zoneId)) - Number(!!a.zoneId && preferred.has(a.zoneId)));
    }
    const names = await this.zoneNames();
    const orderIds = [...new Set(rows.map((t) => t.orderId))];
    const orders = orderIds.length
      ? await this.orders.find({ where: { id: In(orderIds) } })
      : [];
    const byId = new Map(orders.map((o) => [o.id, o]));
    return rows.map((t) => {
      const o = byId.get(t.orderId) ?? null;
      return {
        id: t.id,
        orderId: t.orderId,
        orderReference: t.orderReference,
        status: t.status,
        zoneId: t.zoneId,
        zoneName: t.zoneId ? (names.get(t.zoneId) ?? t.zoneId) : null,
        hubId: t.hubId ?? null,
        preferred: !!t.zoneId && preferred.has(t.zoneId),
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
              customerName: o.customerName,
              paymentMethod: o.paymentMethod,
              estimatedDeliveryDate: o.estimatedDeliveryDate ?? null,
              totalUsd: o.totalUsd,
              shippingAddress: o.shippingAddress,
              items: o.items ?? [],
            }
          : null,
      };
    });
  }
}
