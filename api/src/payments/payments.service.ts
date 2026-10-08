import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Order, Payment } from '../database/entities';
import type { PaymentPurpose, PaymentStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../content/settings.service';
import {
  MOBILE_MONEY_METHODS,
  MOBILE_MONEY_PROVIDER,
  isMobileMoney,
  type MobileMoneyEvent,
  type MobileMoneyProvider,
} from './mobile-money.provider';

/** Called once when an ORDER payment reaches a final state (set by OrdersService). */
export type OrderPaymentSettledHandler = (
  payment: Payment,
  outcome: 'succeeded' | 'failed',
) => Promise<void>;

const mask = (phone: string | null) =>
  phone ? `${phone.slice(0, 4)}…${phone.slice(-2)}` : null;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private orderSettled: OrderPaymentSettledHandler | null = null;
  private sweeper: NodeJS.Timeout | null = null;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly settings: SettingsService,
    @Inject(MOBILE_MONEY_PROVIDER)
    private readonly mobileMoney: MobileMoneyProvider | null,
  ) {}

  onModuleInit() {
    this.logger.log(
      this.mobileMoney
        ? `Mobile money provider: ${this.mobileMoney.name}`
        : 'Mobile money provider: none (mobile-money payments are refused)',
    );
    // Abandoned approvals must not hold stock forever.
    this.sweeper = setInterval(() => void this.expireStale().catch(() => undefined), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.timers.forEach(clearTimeout);
  }

  registerOrderSettledHandler(fn: OrderPaymentSettledHandler) {
    this.orderSettled = fn;
  }

  /** Which payment methods may be used right now (policy + configuration). */
  async assertMethodAllowed(method: string): Promise<void> {
    if (method === 'wallet') return;
    if (method === 'cod') {
      if ((await this.settings.get('codEnabled')) !== 'true') {
        throw new BadRequestException('Cash on delivery is not available.');
      }
      return;
    }
    if (isMobileMoney(method)) {
      if (!this.mobileMoney) {
        throw new BadRequestException('Mobile money is not available yet. Please use another method.');
      }
      return;
    }
    if (method === 'stripe_card') {
      // No card processor is integrated: allow the mock only outside production
      // so production can never "sell" against a card that was never charged.
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('Card payments are not available.');
      }
      return;
    }
    throw new BadRequestException('Unknown payment method.');
  }

  static normalisePhone(raw: unknown): string {
    const phone = String(raw ?? '').replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{9,15}$/.test(phone)) {
      throw new BadRequestException('Enter a valid mobile-money phone number, e.g. +243 81 234 5678.');
    }
    return phone;
  }

  /**
   * Charge for an order according to its payment method:
   *  - wallet        → debit the balance now (caller pre-checks funds)
   *  - mobile money  → `pending` until the subscriber approves (webhook settles)
   *  - card          → mock authorize (non-production only)
   *  - cod           → pending; collected on delivery
   */
  async processForOrder(order: Order, phone?: string): Promise<Payment> {
    await this.assertMethodAllowed(order.paymentMethod);

    let status: PaymentStatus = 'succeeded';
    let failureReason: string | null = null;
    let normalisedPhone: string | null = null;
    if (isMobileMoney(order.paymentMethod)) {
      normalisedPhone = PaymentsService.normalisePhone(phone);
      status = 'pending';
    }

    try {
      if (order.paymentMethod === 'wallet') {
        await this.wallet.debit(order.customerId, order.totalUsd, `Order ${order.reference}`);
      } else if (order.paymentMethod === 'cod') {
        status = 'pending';
      }
    } catch (err) {
      status = 'failed';
      failureReason = (err as Error).message;
    }

    let payment = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: order.id,
        orderReference: order.reference,
        purpose: 'order',
        userId: order.customerId,
        method: order.paymentMethod,
        amountUsd: order.totalUsd,
        status,
        failureReason,
        phone: normalisedPhone,
      }),
    );

    if (status === 'pending' && normalisedPhone) {
      payment = await this.startMobileMoney(payment);
    }

    this.emitter.toUser(order.customerId, 'payment:created', this.view(payment));
    this.emitter.toRoles(ADMIN_ROLES, 'payment:created', this.view(payment));
    await this.notifications.toRole('admin_finance', {
      title: 'Payment',
      body: `${payment.reference} · ${order.paymentMethod} · $${order.totalUsd.toFixed(2)} · ${payment.status}`,
      type: 'payment',
      entityId: order.id,
    });

    if (payment.status === 'failed') {
      throw new BadRequestException(payment.failureReason ?? 'Payment failed.');
    }
    return payment;
  }

  /** Start a wallet top-up through mobile money. Credits the wallet only when confirmed. */
  async startTopUp(userId: string, amountUsd: number, method: string, phone: unknown): Promise<Payment> {
    if (!isMobileMoney(method)) {
      throw new BadRequestException(`Top-up method must be one of: ${MOBILE_MONEY_METHODS.join(', ')}.`);
    }
    await this.assertMethodAllowed(method);
    const payment = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: null,
        orderReference: null,
        purpose: 'topup',
        userId,
        method,
        amountUsd,
        status: 'pending',
        phone: PaymentsService.normalisePhone(phone),
      }),
    );
    const started = await this.startMobileMoney(payment);
    this.emitter.toUser(userId, 'payment:created', this.view(started));
    if (started.status === 'failed') {
      throw new BadRequestException(started.failureReason ?? 'Payment failed.');
    }
    return started;
  }

  /** Ask the network to prompt the subscriber; a provider error fails the payment. */
  private async startMobileMoney(payment: Payment): Promise<Payment> {
    try {
      const { providerRef } = await this.mobileMoney!.initiate({
        reference: payment.reference,
        amountUsd: payment.amountUsd,
        phone: payment.phone!,
        network: payment.method as (typeof MOBILE_MONEY_METHODS)[number],
      });
      payment.providerRef = providerRef;
      payment = await this.payments.save(payment);
    } catch (err) {
      this.logger.error(`Mobile money initiate failed for ${payment.reference}: ${(err as Error).message}`);
      payment.status = 'failed';
      payment.failureReason = 'Could not reach the mobile-money network. Please try again.';
      return this.payments.save(payment);
    }
    this.maybeAutoConfirmSandbox(payment);
    return payment;
  }

  /** Dev convenience: simulate the subscriber approving, through the SAME settle path. */
  private maybeAutoConfirmSandbox(payment: Payment) {
    if (this.mobileMoney?.name !== 'sandbox') return;
    const ms = Number(process.env.MM_SANDBOX_AUTOCONFIRM_MS ?? 1500);
    if (!(ms > 0)) return;
    const declined = (payment.phone ?? '').endsWith('0000');
    const t = setTimeout(() => {
      this.timers.delete(t);
      void this.settle({
        reference: payment.reference,
        outcome: declined ? 'failed' : 'succeeded',
        providerRef: payment.providerRef ?? undefined,
        reason: declined ? 'Declined by subscriber.' : undefined,
      }).catch((e) => this.logger.error(`sandbox settle failed: ${(e as Error).message}`));
    }, ms);
    t.unref();
    this.timers.add(t);
  }

  /** Entry point for the aggregator webhook (signature already verified by the provider). */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): MobileMoneyEvent {
    if (!this.mobileMoney) throw new Error('Mobile money is not configured.');
    return this.mobileMoney.parseWebhook(rawBody, headers);
  }

  /**
   * Apply a final result to a payment. Idempotent: a payment settles once, so
   * webhook retries and the sandbox timer cannot double-credit.
   */
  async settle(event: MobileMoneyEvent): Promise<Payment | null> {
    const payment = await this.payments.findOne({ where: { reference: event.reference } });
    if (!payment) return null;
    if (payment.status === 'succeeded' || payment.status === 'refunded') return payment;

    // An amount that doesn't match what we asked for is never accepted as success.
    if (
      event.outcome === 'succeeded' &&
      event.amountUsd != null &&
      Math.abs(event.amountUsd - payment.amountUsd) > 0.009
    ) {
      this.logger.error(`Amount mismatch on ${payment.reference}: got ${event.amountUsd}, expected ${payment.amountUsd}`);
      await this.notifications.toRole('admin_finance', {
        title: 'Payment amount mismatch',
        body: `${payment.reference}: provider reported $${event.amountUsd}, expected $${payment.amountUsd}. Review manually.`,
        type: 'payment',
        entityId: payment.id,
      });
      return payment;
    }

    if (event.providerRef) payment.providerRef = event.providerRef;

    if (event.outcome === 'failed') {
      if (payment.status !== 'pending') return payment; // already failed
      payment.status = 'failed';
      payment.failureReason = event.reason ?? 'Payment was not approved.';
      const saved = await this.payments.save(payment);
      this.publish(saved);
      if (saved.purpose === 'order' && this.orderSettled) await this.orderSettled(saved, 'failed');
      await this.notifications.toUser(saved.userId, {
        title: 'Payment failed',
        body: `${saved.failureReason}`,
        type: 'payment',
        entityId: saved.orderId ?? saved.id,
      });
      return saved;
    }

    // Success. If it arrives AFTER we gave up (timeout / cancelled order), the
    // customer's money is real, so it must not vanish: credit it to their wallet.
    const wasPending = payment.status === 'pending';
    if (payment.purpose === 'topup') {
      await this.wallet.topUp(payment.userId, payment.amountUsd, payment.method);
      payment.status = 'succeeded';
      payment.failureReason = null;
    } else if (wasPending) {
      payment.status = 'succeeded';
      payment.failureReason = null;
    } else {
      await this.wallet.refund(
        payment.userId,
        payment.amountUsd,
        `Payment ${payment.reference} arrived after order ${payment.orderReference} was closed`,
      );
      payment.status = 'refunded';
    }
    const saved = await this.payments.save(payment);
    this.publish(saved);
    if (saved.purpose === 'order' && wasPending && this.orderSettled) {
      await this.orderSettled(saved, 'succeeded');
    }
    await this.notifications.toUser(saved.userId, {
      title: 'Payment received',
      body:
        saved.purpose === 'topup'
          ? `$${saved.amountUsd.toFixed(2)} added to your wallet.`
          : `Payment for ${saved.orderReference} confirmed.`,
      type: 'payment',
      entityId: saved.orderId ?? saved.id,
    });
    return saved;
  }

  /** Fail mobile-money charges nobody approved within the window (default 15 min). */
  async expireStale(): Promise<number> {
    const ttlMin = Number(process.env.MM_PENDING_TTL_MIN ?? 15);
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const stale = await this.payments.find({
      where: { status: 'pending', method: In([...MOBILE_MONEY_METHODS]), createdAt: LessThan(cutoff) },
    });
    for (const p of stale) {
      await this.settle({ reference: p.reference, outcome: 'failed', reason: 'Timed out waiting for approval.' });
    }
    return stale.length;
  }

  /** The order's payment (latest), if any. */
  forOrder(orderId: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  /** The customer abandons an unpaid order: a late approval is then refunded to the wallet. */
  async abandonPending(orderId: string): Promise<void> {
    const p = await this.forOrder(orderId);
    if (p && p.status === 'pending' && isMobileMoney(p.method)) {
      p.status = 'failed';
      p.failureReason = 'Cancelled by customer.';
      this.publish(await this.payments.save(p));
    }
  }

  /** COD collected when the parcel is delivered. */
  async markCollected(orderId: string): Promise<void> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment || payment.status !== 'pending' || payment.method !== 'cod') return;
    payment.status = 'succeeded';
    this.publish(await this.payments.save(payment));
  }

  /** Refund an order, to the wallet (instant store credit) or original method. */
  async refund(orderId: string, toWallet: boolean): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException('No payment for this order.');
    if (payment.status === 'refunded') {
      throw new BadRequestException('Already refunded.');
    }
    if (payment.status !== 'succeeded') {
      throw new BadRequestException('Only a completed payment can be refunded.');
    }
    payment.status = 'refunded';
    const saved = await this.payments.save(payment);

    if (toWallet) {
      await this.wallet.refund(saved.userId, saved.amountUsd, `Refund for ${saved.orderReference}`);
    }

    // Reflect the refund on the order.
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (order) {
      order.status = 'returned';
      await this.orders.save(order);
      this.emitter.toUser(order.customerId, 'order:updated', order);
      this.emitter.toRoles(ADMIN_ROLES, 'order:updated', order);
    }

    this.publish(saved);
    await this.notifications.toUser(saved.userId, {
      title: 'Refund issued',
      body: `$${saved.amountUsd.toFixed(2)} for ${saved.orderReference}${toWallet ? ' → wallet' : ''}.`,
      type: 'payment',
      entityId: orderId,
    });
    return saved;
  }

  async list(user: { id: string; role: string }): Promise<Payment[]> {
    const rows =
      user.role === 'customer' || user.role === 'rider'
        ? await this.payments.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } })
        : await this.payments.find({ order: { createdAt: 'DESC' }, take: 200 });
    return rows.map((p) => this.view(p));
  }

  /** A payment by reference, visible to its owner and to finance/admin. */
  async status(user: { id: string; role: string }, reference: string): Promise<Payment> {
    const p = await this.payments.findOne({ where: { reference } });
    const isStaff = (ADMIN_ROLES as readonly string[]).includes(user.role);
    if (!p || (p.userId !== user.id && !isStaff)) throw new NotFoundException('Payment not found.');
    return this.view(p);
  }

  /** Never push a full subscriber number to dashboards/sockets. */
  private view(p: Payment): Payment {
    return { ...p, phone: mask(p.phone) };
  }

  private publish(saved: Payment) {
    this.emitter.toUser(saved.userId, 'payment:updated', this.view(saved));
    this.emitter.toRoles(ADMIN_ROLES, 'payment:updated', this.view(saved));
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PAY-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}

export type { PaymentPurpose };
