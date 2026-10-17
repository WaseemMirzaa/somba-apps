import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryTask, Order, User } from '../database/entities';

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
  ) {}

  /** Active rider accounts with their open workload (for dispatch screens). */
  async activeRiders() {
    const riders = await this.users.find({ where: { role: 'rider', active: true } });
    const open = await this.tasks.find({ where: { status: In(['assigned', 'picked_up', 'in_transit']) } });
    return riders.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      activeTasks: open.filter((t) => t.riderId === r.id).length,
    }));
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
    const rows = await this.tasks.find({
      where: [{ riderId }, { status: 'unassigned' }],
      order: { createdAt: 'DESC' },
      take: 500,
    });
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
              totalUsd: o.totalUsd,
              shippingAddress: o.shippingAddress,
              items: o.items ?? [],
            }
          : null,
      };
    });
  }
}
