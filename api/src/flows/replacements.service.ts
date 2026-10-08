import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Replacement } from '../database/entities';
import type { ReplacementStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];

/** Like-for-like replacements of defective/returned items. */
@Injectable()
export class ReplacementsService {
  constructor(
    @InjectRepository(Replacement)
    private readonly replacements: Repository<Replacement>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(user: { id: string; role: string }): Promise<Replacement[]> {
    // Ops (admin roles, warehouse) see all; everyone else only their own.
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.replacements.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.replacements.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' } });
  }

  async create(
    actor: { id: string; name: string; role: string },
    input: {
      orderId: string;
      sku: string;
      productName: string;
      reason?: string;
      condition?: string;
    },
  ): Promise<Replacement> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    // Customers may only file for their own DELIVERED orders; ops for any.
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for a replacement.');
    }
    if (!String(input.sku ?? '').trim() || !String(input.productName ?? '').trim()) {
      throw new BadRequestException('Say which item needs replacing.');
    }
    const rep = await this.replacements.save(
      this.replacements.create({
        reference: `REP-${Date.now().toString().slice(-8)}`,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        sku: String(input.sku).slice(0, 100),
        productName: String(input.productName).slice(0, 200),
        reason: input.reason ? String(input.reason).slice(0, 1000) : null,
        condition: input.condition ? String(input.condition).slice(0, 100) : null,
        status: 'requested',
        dispatchStatus: 'pending',
      }),
    );
    this.emitter.toRoles(OPS_ROLES, 'replacement:updated', rep);
    this.emitter.toUser(order.customerId, 'replacement:updated', rep);
    await this.notifications.toRole('warehouse_staff', {
      title: 'Replacement requested',
      body: `${rep.reference} · ${rep.productName}`,
      type: 'replacement',
      entityId: rep.id,
    });
    return rep;
  }

  async setStatus(id: string, status: ReplacementStatus): Promise<Replacement> {
    const rep = await this.replacements.findOne({ where: { id } });
    if (!rep) throw new NotFoundException('Replacement not found.');
    rep.status = status;
    if (status === 'allocated') rep.dispatchStatus = 'ready';
    if (status === 'dispatched') rep.dispatchStatus = 'dispatched';
    const saved = await this.replacements.save(rep);
    this.emitter.toRoles(OPS_ROLES, 'replacement:updated', saved);
    if (saved.customerId) {
      this.emitter.toUser(saved.customerId, 'replacement:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: `Replacement ${status}`,
        body: `${saved.reference}: ${saved.productName}`,
        type: 'replacement',
        entityId: saved.id,
      });
    }
    return saved;
  }
}
