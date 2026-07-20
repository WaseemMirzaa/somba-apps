import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryTask, Order } from '../database/entities';

const PER_DELIVERY_USD = 2.5;

@Injectable()
export class RiderService {
  constructor(
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

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
