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

  /** Earnings + shift summary for a rider. */
  async earnings(riderId: string) {
    const mine = await this.tasks.find({ where: { riderId } });
    const delivered = mine.filter((t) => t.status === 'delivered');
    const codCollected = delivered.reduce((s, t) => s + t.codAmountUsd, 0);
    const active = mine.filter(
      (t) => t.status !== 'delivered' && t.status !== 'failed',
    ).length;
    return {
      totalTasks: mine.length,
      delivered: delivered.length,
      active,
      codCollectedUsd: Number(codCollected.toFixed(2)),
      earningsUsd: Number((delivered.length * PER_DELIVERY_USD).toFixed(2)),
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
