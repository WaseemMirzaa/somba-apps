import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exchange, Order } from '../database/entities';
import type { ExchangeStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];

/** Exchange one purchased item for another variant/product. */
@Injectable()
export class ExchangesService {
  constructor(
    @InjectRepository(Exchange) private readonly exchanges: Repository<Exchange>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(user: { id: string; role: string }): Promise<Exchange[]> {
    if (user.role === 'customer') {
      return this.exchanges.find({
        where: { customerId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    return this.exchanges.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async create(
    actor: { id: string; name: string },
    input: {
      orderId: string;
      fromSku: string;
      fromName: string;
      toSku: string;
      toName: string;
      priceDiffUsd?: number;
      reason?: string;
    },
  ): Promise<Exchange> {
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const ex = await this.exchanges.save(
      this.exchanges.create({
        reference: `EXC-${Date.now().toString().slice(-8)}`,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        fromSku: input.fromSku,
        fromName: input.fromName,
        toSku: input.toSku,
        toName: input.toName,
        priceDiffUsd: input.priceDiffUsd ?? 0,
        reason: input.reason ?? null,
        status: 'requested',
      }),
    );
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', ex);
    this.emitter.toUser(order.customerId, 'exchange:updated', ex);
    await this.notifications.toRole('warehouse_staff', {
      title: 'Exchange requested',
      body: `${ex.reference} · ${ex.fromName} → ${ex.toName}`,
      type: 'exchange',
      entityId: ex.id,
    });
    return ex;
  }

  async setStatus(id: string, status: ExchangeStatus): Promise<Exchange> {
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex) throw new NotFoundException('Exchange not found.');
    ex.status = status;
    const saved = await this.exchanges.save(ex);
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', saved);
    if (saved.customerId) {
      this.emitter.toUser(saved.customerId, 'exchange:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: `Exchange ${status}`,
        body: `${saved.reference}: ${saved.fromName} → ${saved.toName}`,
        type: 'exchange',
        entityId: saved.id,
      });
    }
    return saved;
  }
}
