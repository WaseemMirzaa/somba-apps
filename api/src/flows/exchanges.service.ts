import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.exchanges.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.exchanges.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' } });
  }

  async create(
    actor: { id: string; name: string; role: string },
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
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for an exchange.');
    }
    for (const k of ['fromSku', 'fromName', 'toSku', 'toName'] as const) {
      if (!String(input[k] ?? '').trim()) throw new BadRequestException('Say which item you want to exchange and for what.');
    }
    // Customers can't set the price difference — ops settle it later.
    const diff = ops && Number.isFinite(Number(input.priceDiffUsd)) ? Math.max(-100000, Math.min(100000, Number(input.priceDiffUsd))) : 0;
    const ex = await this.exchanges.save(
      this.exchanges.create({
        reference: `EXC-${Date.now().toString().slice(-8)}`,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        fromSku: String(input.fromSku).slice(0, 100),
        fromName: String(input.fromName).slice(0, 200),
        toSku: String(input.toSku).slice(0, 100),
        toName: String(input.toName).slice(0, 200),
        priceDiffUsd: diff,
        reason: input.reason ? String(input.reason).slice(0, 1000) : null,
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
