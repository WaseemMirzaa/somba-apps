import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, Order } from '../database/entities';
import type { DisputeType } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async open(
    customer: { id: string; name: string },
    input: { orderId: string; type: DisputeType; reason: string },
  ): Promise<Dispute> {
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.customerId !== customer.id) {
      throw new BadRequestException('You can only dispute your own orders.');
    }
    const dispute = await this.disputes.save(
      this.disputes.create({
        reference: DisputesService.newReference(input.type),
        orderId: order.id,
        orderReference: order.reference,
        customerId: customer.id,
        customerName: customer.name,
        type: input.type ?? 'dispute',
        reason: input.reason,
        status: 'open',
      }),
    );
    this.emitter.toUser(customer.id, 'dispute:created', dispute);
    this.emitter.toRoles(ADMIN_ROLES, 'dispute:created', dispute);
    await this.notifications.toRole('admin_support', {
      title: input.type === 'return' ? 'Return requested' : 'Dispute opened',
      body: `${dispute.reference} · ${order.reference} · ${customer.name}`,
      type: 'dispute',
      entityId: dispute.id,
    });
    return dispute;
  }

  /** Admin resolves; optionally refunds the order to the customer wallet. */
  async resolve(
    disputeId: string,
    opts: { resolution?: string; refund?: boolean },
  ): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    dispute.status = 'resolved';
    dispute.resolution = opts.resolution ?? (opts.refund ? 'Refunded to wallet' : 'Resolved');
    const saved = await this.disputes.save(dispute);

    if (opts.refund) {
      // Reuse the payments refund path (credits wallet + marks order returned).
      await this.payments.refund(saved.orderId, true).catch(() => undefined);
    }

    this.emitter.toUser(saved.customerId, 'dispute:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'dispute:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Dispute resolved',
      body: `${saved.reference}: ${saved.resolution}`,
      type: 'dispute',
      entityId: saved.id,
    });
    return saved;
  }

  async reject(disputeId: string, resolution?: string): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    dispute.status = 'rejected';
    dispute.resolution = resolution ?? 'Rejected';
    const saved = await this.disputes.save(dispute);
    this.emitter.toUser(saved.customerId, 'dispute:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'dispute:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Dispute closed',
      body: `${saved.reference}: ${saved.resolution}`,
      type: 'dispute',
      entityId: saved.id,
    });
    return saved;
  }

  list(user: { id: string; role: string }): Promise<Dispute[]> {
    if (user.role === 'customer') {
      return this.disputes.find({
        where: { customerId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    return this.disputes.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  private static newReference(type: DisputeType): string {
    const prefix = type === 'return' ? 'RET' : 'DP';
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
