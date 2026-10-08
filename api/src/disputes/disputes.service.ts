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
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    // Same answer for "missing" and "not yours".
    if (!order || order.customerId !== customer.id) throw new NotFoundException('Order not found.');
    const type: DisputeType = input.type === 'return' ? 'return' : 'dispute';
    const reason = String(input?.reason ?? '').trim();
    if (reason.length < 5) throw new BadRequestException('Please describe the problem (at least a few words).');
    if (['pending', 'cancelled'].includes(order.status)) {
      throw new BadRequestException('This order has not been paid for or was cancelled.');
    }
    const already = await this.disputes.count({ where: { orderId: order.id, customerId: customer.id, status: 'open' } });
    if (already) throw new BadRequestException('You already have an open request for this order.');
    const dispute = await this.disputes.save(
      this.disputes.create({
        reference: DisputesService.newReference(type),
        orderId: order.id,
        orderReference: order.reference,
        customerId: customer.id,
        customerName: customer.name,
        type,
        reason: reason.slice(0, 2000),
        status: 'open',
      }),
    );
    this.emitter.toUser(customer.id, 'dispute:created', dispute);
    this.emitter.toRoles(ADMIN_ROLES, 'dispute:created', dispute);
    await this.notifications.toRole('admin_support', {
      title: type === 'return' ? 'Return requested' : 'Dispute opened',
      body: `${dispute.reference} · ${order.reference} · ${customer.name}`,
      type: 'dispute',
      entityId: dispute.id,
    });
    return dispute;
  }

  /**
   * Admin resolves an OPEN dispute; optionally refunds the order to the customer
   * wallet. Refunding moves money, so it needs finance/admin (`canRefund`) — and
   * if the refund cannot be made the dispute is NOT marked resolved.
   */
  async resolve(
    disputeId: string,
    opts: { resolution?: string; refund?: boolean },
    canRefund: boolean,
  ): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.status !== 'open') throw new BadRequestException('This request was already handled.');
    if (opts.refund && !canRefund) {
      throw new BadRequestException('Only admin or finance can issue a refund.');
    }
    if (opts.refund) {
      await this.payments.refund(dispute.orderId, true); // throws if it can't be refunded
    }
    const claim = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set({
        status: 'resolved',
        resolution: String(opts.resolution ?? (opts.refund ? 'Refunded to wallet' : 'Resolved')).slice(0, 1000),
      })
      .where("id = :id AND status = 'open'", { id: disputeId })
      .execute();
    if (!claim.affected) throw new BadRequestException('This request was already handled.');
    const saved = (await this.disputes.findOne({ where: { id: disputeId } }))!;

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
    const claim = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set({ status: 'rejected', resolution: String(resolution ?? 'Rejected').slice(0, 1000) })
      .where("id = :id AND status = 'open'", { id: disputeId })
      .execute();
    if (!claim.affected) throw new BadRequestException('This request was already handled.');
    const saved = (await this.disputes.findOne({ where: { id: disputeId } }))!;
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
    // Admin roles (support/finance…) see all; everyone else only their own.
    if (user.role.startsWith('admin')) {
      return this.disputes.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return this.disputes.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' } });
  }

  private static newReference(type: DisputeType): string {
    const prefix = type === 'return' ? 'RET' : 'DP';
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
