import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, Order, Seller } from '../database/entities';
import type { DisputeType } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { ProductsService } from '../products/products.service';
import { sellerUserIdsOf } from '../orders/order-sellers';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly products: ProductsService,
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
    const sellerIds = await this.sellersOf(order);
    this.broadcast('dispute:created', dispute, sellerIds);
    await this.notifications.toRole('admin_support', {
      title: type === 'return' ? 'Return requested' : 'Dispute opened',
      body: `${dispute.reference} · ${order.reference} · ${customer.name}`,
      type,
      entityId: dispute.id,
    });
    // Sellers learn about a problem on their own items as soon as it is raised.
    await this.notifications.toUsers(sellerIds, {
      title: type === 'return' ? 'Return requested on your order' : 'Dispute opened on your order',
      body: `${dispute.reference} · ${order.reference}: ${dispute.reason.slice(0, 140)}`,
      type,
      entityId: dispute.id,
    });
    return dispute;
  }

  /** The sellers with lines on the dispute's order (best effort: an unknown order has none). */
  private async sellersOf(orderOrId: Order | string): Promise<string[]> {
    try {
      const order = typeof orderOrId === 'string' ? await this.orders.findOne({ where: { id: orderOrId } }) : orderOrId;
      if (!order) return [];
      return await sellerUserIdsOf(order, this.products, this.sellers, { includeCancelled: true });
    } catch {
      return [];
    }
  }

  /** Live updates: the customer, admins, the sellers on the order and, for returns, the warehouse. */
  private broadcast(event: 'dispute:created' | 'dispute:updated', dispute: Dispute, sellerIds: string[]): void {
    this.emitter.toUser(dispute.customerId, event, dispute);
    this.emitter.toRoles(dispute.type === 'return' ? [...ADMIN_ROLES, 'warehouse_staff'] : ADMIN_ROLES, event, dispute);
    for (const id of sellerIds) this.emitter.toUser(id, event, dispute);
  }

  /** Tell the sellers on the order how a request ended. */
  private async tellSellers(dispute: Dispute, sellerIds: string[], title: string, body: string): Promise<void> {
    await this.notifications.toUsers(sellerIds, { title, body, type: dispute.type, entityId: dispute.id });
  }

  /**
   * Admin resolves an OPEN dispute; optionally refunds the order to the customer
   * wallet. Refunding moves money, so it needs finance/admin (`canRefund`) — and
   * if the refund cannot be made the dispute is NOT marked resolved.
   */
  /**
   * The warehouse confirms the returned goods arrived. A refund on a return
   * needs this first, so money never goes back while the goods are still with
   * the customer. Resellable goods go back into stock.
   */
  async markReceived(disputeId: string, restock = true): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.type !== 'return') throw new BadRequestException('Only returns have goods to receive.');
    if (dispute.status !== 'open') throw new BadRequestException('This request was already handled.');
    const claim = await this.disputes
      .createQueryBuilder()
      .update(Dispute)
      .set({ receivedAt: new Date() })
      .where('id = :id AND receivedAt IS NULL', { id: disputeId })
      .execute();
    if (!claim.affected) throw new BadRequestException('These goods were already marked as received.');
    if (restock) {
      const order = await this.orders.findOne({ where: { id: dispute.orderId } });
      for (const item of order?.items ?? []) {
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') await this.products.restock(item.productId, item.qty);
      }
    }
    const saved = (await this.disputes.findOne({ where: { id: disputeId } }))!;
    const sellerIds = await this.sellersOf(saved.orderId);
    this.broadcast('dispute:updated', saved, sellerIds);
    await this.notifications.toUser(saved.customerId, {
      title: 'Return received',
      body: `${saved.reference}: we received your goods. Your request is being reviewed.`,
      type: 'return',
      entityId: saved.id,
    });
    await this.tellSellers(saved, sellerIds, 'Returned goods received', `${saved.reference} · ${saved.orderReference}: the warehouse received the returned goods.`);
    return saved;
  }

  async resolve(
    disputeId: string,
    opts: { resolution?: string; refund?: boolean; force?: boolean },
    canRefund: boolean,
  ): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (dispute.status !== 'open') throw new BadRequestException('This request was already handled.');
    if (opts.refund && !canRefund) {
      throw new BadRequestException('Only admin or finance can issue a refund.');
    }
    if (opts.refund && dispute.type === 'return' && !dispute.receivedAt && !opts.force) {
      throw new BadRequestException('Mark the returned goods as received at the warehouse before refunding.');
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

    const sellerIds = await this.sellersOf(saved.orderId);
    this.broadcast('dispute:updated', saved, sellerIds);
    const what = saved.type === 'return' ? 'Return' : 'Dispute';
    await this.notifications.toUser(saved.customerId, {
      title: `${what} resolved`,
      body: `${saved.reference}: ${saved.resolution}`,
      type: saved.type,
      entityId: saved.id,
    });
    await this.tellSellers(saved, sellerIds, `${what} resolved`, `${saved.reference} · ${saved.orderReference}: ${saved.resolution}`);
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
    const sellerIds = await this.sellersOf(saved.orderId);
    this.broadcast('dispute:updated', saved, sellerIds);
    const what = saved.type === 'return' ? 'Return' : 'Dispute';
    await this.notifications.toUser(saved.customerId, {
      title: `${what} closed`,
      body: `${saved.reference}: ${saved.resolution}`,
      type: saved.type,
      entityId: saved.id,
    });
    await this.tellSellers(saved, sellerIds, `${what} closed`, `${saved.reference} · ${saved.orderReference}: ${saved.resolution}`);
    return saved;
  }

  async list(user: { id: string; role: string }): Promise<Dispute[]> {
    // Admin roles (support/finance…) see all; warehouse staff see the returns to receive;
    // a seller sees the requests on orders that contain THEIR products; customers their own.
    if (user.role.startsWith('admin')) {
      return this.disputes.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    if (user.role === 'warehouse_staff') {
      return this.disputes.find({ where: { type: 'return' }, order: { createdAt: 'DESC' }, take: 200 });
    }
    if (user.role === 'seller') {
      const store = await this.sellers.findOne({ where: { userId: user.id } });
      const ids = new Set([...(await this.products.idsBySeller(store?.id ?? user.id))]);
      if (store?.id && store.id !== user.id) for (const id of await this.products.idsBySeller(user.id)) ids.add(id);
      if (!ids.size) return [];
      const orders = await this.orders
        .createQueryBuilder('o')
        .innerJoin('o.items', 'i')
        .select('o.id')
        .where('i.productId IN (:...ids)', { ids: [...ids] })
        .getMany();
      if (!orders.length) return [];
      return this.disputes
        .createQueryBuilder('d')
        .where('d.orderId IN (:...oids)', { oids: orders.map((o) => o.id) })
        .orderBy('d.createdAt', 'DESC')
        .take(200)
        .getMany();
    }
    return this.disputes.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' }, take: 500 });
  }

  private static newReference(type: DisputeType): string {
    const prefix = type === 'return' ? 'RET' : 'DP';
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
