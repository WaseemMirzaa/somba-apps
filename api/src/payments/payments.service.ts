import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, Payment } from '../database/entities';
import type { PaymentStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /**
   * Charge for an order according to its payment method:
   *  - wallet        → debit the balance now (caller pre-checks funds)
   *  - card / airtel → mock gateway authorize → succeeded
   *  - cod           → pending; collected on delivery
   * Returns the Payment; `succeeded`/`pending` means the order may proceed.
   */
  async processForOrder(order: Order): Promise<Payment> {
    let status: PaymentStatus = 'succeeded';
    let failureReason: string | null = null;

    try {
      if (order.paymentMethod === 'wallet') {
        await this.wallet.debit(
          order.customerId,
          order.totalUsd,
          `Order ${order.reference}`,
        );
        status = 'succeeded';
      } else if (order.paymentMethod === 'cod') {
        status = 'pending';
      } else {
        // stripe_card / airtel_money — mock authorize (always succeeds here).
        status = 'succeeded';
      }
    } catch (err) {
      status = 'failed';
      failureReason = (err as Error).message;
    }

    const payment = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: order.id,
        orderReference: order.reference,
        userId: order.customerId,
        method: order.paymentMethod,
        amountUsd: order.totalUsd,
        status,
        failureReason,
      }),
    );

    this.emitter.toUser(order.customerId, 'payment:created', payment);
    this.emitter.toRoles(ADMIN_ROLES, 'payment:created', payment);
    await this.notifications.toRole('admin_finance', {
      title: 'Payment',
      body: `${payment.reference} · ${order.paymentMethod} · $${order.totalUsd.toFixed(2)} · ${status}`,
      type: 'payment',
      entityId: order.id,
    });

    if (status === 'failed') {
      throw new BadRequestException(failureReason ?? 'Payment failed.');
    }
    return payment;
  }

  /** COD collected when the parcel is delivered. */
  async markCollected(orderId: string): Promise<void> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment || payment.status !== 'pending') return;
    payment.status = 'succeeded';
    const saved = await this.payments.save(payment);
    this.emitter.toUser(saved.userId, 'payment:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'payment:updated', saved);
  }

  /** Refund an order, to the wallet (instant store credit) or original method. */
  async refund(orderId: string, toWallet: boolean): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException('No payment for this order.');
    if (payment.status === 'refunded') {
      throw new BadRequestException('Already refunded.');
    }
    payment.status = 'refunded';
    const saved = await this.payments.save(payment);

    if (toWallet) {
      await this.wallet.refund(
        saved.userId,
        saved.amountUsd,
        `Refund for ${saved.orderReference}`,
      );
    }

    // Reflect the refund on the order.
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (order) {
      order.status = 'returned';
      await this.orders.save(order);
      this.emitter.toUser(order.customerId, 'order:updated', order);
      this.emitter.toRoles(ADMIN_ROLES, 'order:updated', order);
    }

    this.emitter.toUser(saved.userId, 'payment:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'payment:updated', saved);
    await this.notifications.toUser(saved.userId, {
      title: 'Refund issued',
      body: `$${saved.amountUsd.toFixed(2)} for ${saved.orderReference}${toWallet ? ' → wallet' : ''}.`,
      type: 'payment',
      entityId: orderId,
    });
    return saved;
  }

  list(user: { id: string; role: string }): Promise<Payment[]> {
    if (user.role === 'customer' || user.role === 'rider') {
      return this.payments.find({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    return this.payments.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PAY-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}
