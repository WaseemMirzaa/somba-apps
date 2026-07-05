import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    status?: OrderStatus;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.orders.createQueryBuilder('o').orderBy('o.createdAt', 'DESC');

    if (opts.status) qb.andWhere('o.status = :status', { status: opts.status });
    if (opts.q) {
      qb.andWhere('(o.code LIKE :q OR o.customerName LIKE :q)', {
        q: `%${opts.q}%`,
      });
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  async get(id: string) {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, status: OrderStatus, user: AuthUser) {
    const order = await this.get(id);
    order.status = status;
    const saved = await this.orders.save(order);
    await this.items.update({ order: { id } }, { fulfillmentStatus: status });
    await this.audit.log(user, 'order.status', 'Order', id, status);
    return this.get(saved.id);
  }
}
