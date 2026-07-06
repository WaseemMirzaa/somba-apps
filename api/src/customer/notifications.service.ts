import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { Dispute } from '../entities/dispute.entity';
import { User } from '../entities/user.entity';
import { OrderStatus } from '../common/enums';

/**
 * Customer notifications, derived from real backend state (recent orders +
 * disputes). No separate table — the feed is synthesised so it always reflects
 * the current order statuses the admin/seller set.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private orderMessage(status: OrderStatus): { title: string; body: string; kind: string } {
    switch (status) {
      case OrderStatus.DELIVERED:
        return { title: 'Order delivered', body: 'Your order has been delivered. Enjoy!', kind: 'order' };
      case OrderStatus.OUT_FOR_DELIVERY:
        return { title: 'Out for delivery', body: 'Your order is on the way today.', kind: 'delivery' };
      case OrderStatus.SHIPPED:
        return { title: 'Order shipped', body: 'Your order has been shipped.', kind: 'delivery' };
      case OrderStatus.CONFIRMED:
        return { title: 'Order confirmed', body: 'The store confirmed your order.', kind: 'order' };
      case OrderStatus.CANCELLED:
        return { title: 'Order cancelled', body: 'Your order was cancelled.', kind: 'alert' };
      case OrderStatus.RETURNED:
        return { title: 'Return completed', body: 'Your return has been processed.', kind: 'refund' };
      default:
        return { title: 'Order received', body: 'We received your order and are preparing it.', kind: 'order' };
    }
  }

  async listMine(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const orders = await this.orders.find({
      where: { customerEmail: user.email },
      order: { updatedAt: 'DESC' },
      take: 15,
    });
    const disputes = await this.disputes.find({
      where: { customerEmail: user.email },
      order: { updatedAt: 'DESC' },
      take: 10,
    });

    const items = [
      ...orders.map((o) => {
        const m = this.orderMessage(o.status);
        return {
          id: `order-${o.id}`,
          kind: m.kind,
          title: m.title,
          body: `${m.body} (${o.code})`,
          date: o.updatedAt,
        };
      }),
      ...disputes.map((d) => ({
        id: `dispute-${d.id}`,
        kind: 'refund',
        title: d.status === 'resolved' ? 'Return approved' : d.status === 'rejected' ? 'Return declined' : 'Return in review',
        body: `${d.reason} (${d.code})`,
        date: d.updatedAt,
      })),
    ];

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }
}
