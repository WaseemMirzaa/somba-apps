import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { DeliveryTask, Order, Payment, PaymentRefund } from '../database/entities';
import type { RefundKind } from '../database/entities';
import type { PaymentPurpose, PaymentStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { pushOrderToOps } from '../logistics/hub-scope';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../content/settings.service';
import { ProductsService } from '../products/products.service';
import { DEFAULT_LIMIT, pageOf } from '../common/paging';
import { paymentMethodLabel } from '../common/payment-method';
import {
  InitiationUncertainError,
  MOBILE_MONEY_METHODS,
  MOBILE_MONEY_PROVIDER,
  isMobileMoney,
  type MobileMoneyEvent,
  type MobileMoneyProvider,
  type WebhookRequest,
} from './mobile-money.provider';
import { PAWAPAY_CLIENT, PawapayClient, PawapayRejectedError, PawapayUnavailableError } from './pawapay.provider';
import { NOTHING_LEFT_TO_REFUND, recordParkedPayment, recordRefund, refundableUsd, revertRefund } from './refund-ledger';

/** Why a refund is made, when it is not the plain order refund of finance (`orders:refund`). */
export interface RefundSource {
  kind?: Extract<RefundKind, 'admin' | 'dispute'>;
  disputeId?: string;
  disputeReference?: string;
}

/** The payment after a refund, with the ledger row this refund wrote (its `amountUsd` is what THIS refund paid back). */
export type RefundResult = Payment & { refund: PaymentRefund };

/** A payment as clients see it: the phone masked, and what can still be refunded on it. */
export type PaymentView = Payment & { refundableUsd: number };

/** Called when pawaPay reports on a seller payout (set by PayoutsService, which owns payouts). */
export type PayoutCallbackHandler = (payoutId: string) => Promise<void>;

/** Called once when an ORDER payment reaches a final state (set by OrdersService). */
export type OrderPaymentSettledHandler = (
  payment: Payment,
  outcome: 'succeeded' | 'failed',
) => Promise<void>;

/** Called once when a seller-plan payment succeeds (set by SellersService), including a wallet purchase. */
export type PlanPaymentSettledHandler = (payment: Payment) => Promise<void>;

/** Only these admin roles see payment records (live pushes included). */
const FINANCE_ROLES = ['admin', 'admin_finance'];

const mask = (phone: string | null) =>
  phone ? `${phone.slice(0, 4)}…${phone.slice(-2)}` : null;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private orderSettled: OrderPaymentSettledHandler | null = null;
  private planSettled: PlanPaymentSettledHandler | null = null;
  private payoutCallback: PayoutCallbackHandler | null = null;
  private readonly manualInFlight = new Set<string>();
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
    @InjectRepository(DeliveryTask) private readonly deliveries: Repository<DeliveryTask>,
    private readonly products: ProductsService,
    @Optional() @Inject(PAWAPAY_CLIENT) private readonly pawapay: PawapayClient | null = null,
  ) {}

  onModuleInit() {
    this.logger.log(
      this.mobileMoney
        ? `Mobile money provider: ${this.mobileMoney.name}`
        : 'Mobile money provider: none (mobile-money payments are refused)',
    );
    // Abandoned approvals must not hold stock forever; with an aggregator, missed callbacks are caught up first.
    this.sweeper = setInterval(
      () =>
        void this.reconcilePending()
          .then(() => this.expireStale())
          .catch(() => undefined),
      60_000,
    );
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.timers.forEach(clearTimeout);
  }

  registerOrderSettledHandler(fn: OrderPaymentSettledHandler) {
    this.orderSettled = fn;
  }

  registerPlanSettledHandler(fn: PlanPaymentSettledHandler) {
    this.planSettled = fn;
  }

  registerPayoutCallbackHandler(fn: PayoutCallbackHandler) {
    this.payoutCallback = fn;
  }

  /** Which mobile-money provider is live ('pawapay', 'sandbox', 'manual'), or null. */
  get providerName(): string | null {
    return this.mobileMoney?.name ?? null;
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
    this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(payment));
    await this.notifications.toRole('admin_finance', {
      title: 'Payment',
      body: `${payment.reference} · ${paymentMethodLabel(order.paymentMethod)} · $${order.totalUsd.toFixed(2)} · ${payment.status}`,
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
    // Don't let one account fire unlimited approval prompts at arbitrary numbers.
    const open = await this.payments.count({ where: { userId, purpose: 'topup', status: 'pending' } });
    if (open >= 3) {
      throw new BadRequestException('You already have pending top-ups. Approve or wait for them to expire first.');
    }
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

  /**
   * Buy a seller plan. `wallet` is charged at once (and the plan activates);
   * mobile money stays `pending` until the network / finance confirms, and the
   * plan activates through the normal settle path (payment:updated -> succeeded).
   */
  async startPlanPayment(
    userId: string,
    plan: { id: string; priceUsd: number },
    method: string,
    phone: unknown,
  ): Promise<Payment> {
    const amount = Number(plan.priceUsd.toFixed(2));
    if (method === 'wallet') {
      const payment = await this.payments.manager.transaction(async (m) => {
        await this.wallet.apply(userId, 'debit', amount, `Seller plan ${plan.id}`, m);
        return m.save(
          this.payments.create({
            reference: PaymentsService.newReference(),
            orderId: null,
            orderReference: null,
            purpose: 'plan',
            subject: plan.id,
            userId,
            method: 'wallet',
            amountUsd: amount,
            status: 'succeeded',
          }),
        );
      });
      this.emitter.toUser(userId, 'payment:created', this.view(payment));
      this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(payment));
      if (this.planSettled) await this.planSettled(payment);
      return this.view(payment);
    }
    if (!isMobileMoney(method)) {
      throw new BadRequestException(`Pay with your wallet or mobile money (${MOBILE_MONEY_METHODS.join(', ')}).`);
    }
    await this.assertMethodAllowed(method);
    const open = await this.payments.count({ where: { userId, purpose: 'plan', status: 'pending' } });
    if (open >= 2) {
      throw new BadRequestException('You already have a pending plan payment. Approve it or wait for it to expire first.');
    }
    const created = await this.payments.save(
      this.payments.create({
        reference: PaymentsService.newReference(),
        orderId: null,
        orderReference: null,
        purpose: 'plan',
        subject: plan.id,
        userId,
        method,
        amountUsd: amount,
        status: 'pending',
        phone: PaymentsService.normalisePhone(phone),
      }),
    );
    const started = await this.startMobileMoney(created);
    this.emitter.toUser(userId, 'payment:created', this.view(started));
    this.emitter.toRoles(FINANCE_ROLES, 'payment:created', this.view(started));
    if (started.status === 'failed') {
      throw new BadRequestException(started.failureReason ?? 'Payment failed.');
    }
    return this.view(started);
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
      if (err instanceof InitiationUncertainError) {
        // No answer from the aggregator: the charge may exist. Stay pending; the status check settles it.
        this.logger.warn(`Mobile money initiate unconfirmed for ${payment.reference}: ${err.message}`);
        payment.providerRef = err.providerRef;
        return this.payments.save(payment);
      }
      this.logger.error(`Mobile money initiate failed for ${payment.reference}: ${(err as Error).message}`);
      payment.status = 'failed';
      payment.failureReason =
        err instanceof PawapayRejectedError
          ? `The mobile-money network refused the payment: ${err.message}`
          : 'Could not reach the mobile-money network. Please try again.';
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

  /**
   * Finance confirms (or declines) a pending mobile-money payment by hand —
   * the fallback when no aggregator is connected (`MM_PROVIDER=manual`) and a
   * convenient test hook with the sandbox. Uses the same atomic settle path.
   */
  async decideManually(reference: string, outcome: 'succeeded' | 'failed', reason?: string): Promise<Payment> {
    if (!['manual', 'sandbox'].includes(this.mobileMoney?.name ?? '')) {
      throw new BadRequestException('Manual confirmation is only available with MM_PROVIDER=manual.');
    }
    // Two finance users clicking at once: only one request is handled, the other is told so.
    if (this.manualInFlight.has(reference)) throw new BadRequestException('This payment is being processed right now.');
    this.manualInFlight.add(reference);
    try {
      const payment = await this.payments.findOne({ where: { reference } });
      if (!payment) throw new NotFoundException('Payment not found.');
      if (payment.status !== 'pending') throw new BadRequestException(`This payment is already ${payment.status}.`);
      const done = await this.settle({
        reference,
        outcome,
        providerRef: payment.providerRef ?? undefined,
        reason: outcome === 'failed' ? (reason?.trim() || 'Declined by finance.') : undefined,
      });
      return this.view(done ?? payment) as Payment;
    } finally {
      this.manualInFlight.delete(reference);
    }
  }

  /** Entry point for the aggregator webhook (signature already verified by the provider). */
  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    req?: WebhookRequest,
  ): Promise<MobileMoneyEvent> {
    if (!this.mobileMoney) throw new Error('Mobile money is not configured.');
    return this.mobileMoney.parseWebhook(rawBody, headers, req);
  }

  /**
   * pawaPay callback (deposits, refunds and payouts share one URL). The signature is checked when signatures are on,
   * then the operation's real status is read from pawaPay before anything changes. Returns what it was about.
   */
  async handlePawapayCallback(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    req: WebhookRequest,
  ): Promise<{ kind: string; id: string }> {
    if (!this.pawapay) throw new Error('pawaPay is not configured.');
    if (this.pawapay.verifySignatures) await this.pawapay.verifyCallback(rawBody, headers, req);
    const target = PawapayClient.callbackTarget(rawBody);
    if (target.kind === 'deposits') {
      const payment = await this.payments.findOne({ where: { providerRef: target.id } });
      if (payment) await this.reconcileOne(payment);
    } else if (target.kind === 'refunds') {
      await this.reconcileRefund(target.id);
    } else if (this.payoutCallback) {
      await this.payoutCallback(target.id);
    }
    return target;
  }

  /** Ask the aggregator about one pending charge and apply its final result (no-op while still in progress). */
  private async reconcileOne(payment: Payment): Promise<Payment> {
    if (payment.status !== 'pending' || !this.mobileMoney?.checkStatus || !payment.providerRef) return payment;
    try {
      const event = await this.mobileMoney.checkStatus({ reference: payment.reference, providerRef: payment.providerRef });
      if (!event) return payment;
      return (await this.settle({ ...event, reference: payment.reference })) ?? payment;
    } catch (e) {
      this.logger.warn(`Status check failed for ${payment.reference}: ${(e as Error).message}`);
      return payment;
    }
  }

  /** Catch up on callbacks that never arrived: pending charges older than two minutes, plus phone refunds in flight. */
  async reconcilePending(): Promise<void> {
    if (!this.mobileMoney?.checkStatus) return;
    const cutoff = new Date(Date.now() - 120_000);
    const pending = await this.payments.find({
      where: { status: 'pending', method: In([...MOBILE_MONEY_METHODS]), createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC' },
      take: 25,
    });
    for (const p of pending) await this.reconcileOne(p);
    const sending = await this.payments.find({ where: { refundStatus: 'sending' }, take: 25 });
    for (const p of sending) if (p.refundRef) await this.reconcileRefund(p.refundRef);
  }

  /** Move a payment between states ONLY if it is still in one of `from` (atomic). */
  private async claim(
    m: EntityManager,
    id: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    failureReason?: string | null,
  ): Promise<boolean> {
    const res = await m
      .createQueryBuilder()
      .update(Payment)
      .set({ status: to, ...(failureReason !== undefined ? { failureReason } : {}) })
      .where('id = :id AND status IN (:...from)', { id, from })
      .execute();
    return !!res.affected;
  }

  /**
   * Apply a final result to a payment. Idempotent AND race-free: each state
   * change is a conditional UPDATE (so a retried webhook arriving at the same
   * instant as another can only win once), and the money movement happens in the
   * same transaction as the state change.
   */
  async settle(event: MobileMoneyEvent): Promise<Payment | null> {
    const payment =
      (event.reference ? await this.payments.findOne({ where: { reference: event.reference } }) : null) ??
      (event.providerRef ? await this.payments.findOne({ where: { providerRef: event.providerRef } }) : null);
    if (!payment) return null;
    event = { ...event, reference: payment.reference };
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

    if (event.providerRef && payment.providerRef !== event.providerRef) {
      await this.payments.update({ id: payment.id }, { providerRef: event.providerRef });
    }

    if (event.outcome === 'failed') {
      const won = await this.claim(this.payments.manager, payment.id, ['pending'], 'failed', event.reason ?? 'Payment was not approved.');
      const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
      if (!won) return saved; // already settled by someone else
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
    let wasPending = false;
    const won = await this.payments.manager.transaction(async (m) => {
      if (payment.purpose === 'topup') {
        if (!(await this.claim(m, payment.id, ['pending', 'failed'], 'succeeded', null))) return false;
        await this.wallet.apply(payment.userId, 'topup', payment.amountUsd, `Wallet top-up via ${paymentMethodLabel(payment.method)}`, m);
        return true;
      }
      if (await this.claim(m, payment.id, ['pending'], 'succeeded', null)) {
        wasPending = true;
        return true;
      }
      // Late success on a payment we already failed: park the money in the wallet.
      if (!(await this.claim(m, payment.id, ['failed'], 'refunded'))) return false;
      const memo = `Payment ${payment.reference} arrived after order ${payment.orderReference} was closed`;
      await this.wallet.apply(payment.userId, 'refund', payment.amountUsd, memo, m);
      await recordParkedPayment(m, payment, memo); // C-refund: recorded like every refund
      return true;
    });
    const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
    if (!won) return saved;
    this.publish(saved);
    if (saved.purpose === 'order' && wasPending && this.orderSettled) {
      await this.orderSettled(saved, 'succeeded');
    }
    if (saved.purpose === 'plan' && wasPending && this.planSettled) {
      await this.planSettled(saved);
    }
    await this.notifications.toUser(saved.userId, {
      title: 'Payment received',
      body:
        saved.purpose === 'topup'
          ? `$${saved.amountUsd.toFixed(2)} added to your wallet.`
          : saved.purpose === 'plan'
            ? `Payment for your ${saved.subject ?? ''} seller plan confirmed.`
            : `Payment for ${saved.orderReference} confirmed.`,
      type: 'payment',
      entityId: saved.orderId ?? saved.id,
    });
    return saved;
  }

  /** Fail mobile-money charges nobody approved within the window (default 15 min). */
  async expireStale(): Promise<number> {
    const ttlMin = Number(process.env.MM_PENDING_TTL_MIN ?? (this.mobileMoney?.name === 'manual' ? 1440 : 15));
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const stale = await this.payments.find({
      where: { status: 'pending', method: In([...MOBILE_MONEY_METHODS]), createdAt: LessThan(cutoff) },
    });
    for (const p of stale) {
      // The aggregator has the last word: a charge it completed is settled, not expired.
      const checked = await this.reconcileOne(p);
      if (checked.status !== 'pending') continue;
      await this.settle({ reference: p.reference, outcome: 'failed', reason: 'Timed out waiting for approval.' });
    }
    return stale.length;
  }

  /** The order's payment (latest), if any. */
  forOrder(orderId: string): Promise<Payment | null> {
    return this.payments.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  /** COD collected when the parcel is delivered. */
  async markCollected(orderId: string): Promise<void> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment || payment.status !== 'pending' || payment.method !== 'cod') return;
    payment.status = 'succeeded';
    this.publish(await this.payments.save(payment));
  }

  /**
   * Called when an order is cancelled. If we actually collected money for it
   * (prepaid, not COD), the payment is marked refunded and the wallet credited in
   * ONE transaction; a pending payment is simply abandoned (a late approval is
   * then credited to the wallet by [settle]). Returns the amount credited to the wallet (0 when none).
   */
  async refundCancelledOrder(order: Order): Promise<number> {
    const payment = await this.forOrder(order.id);
    if (!payment) return 0;
    if (payment.status === 'pending') {
      if (isMobileMoney(payment.method)) {
        await this.claim(this.payments.manager, payment.id, ['pending'], 'failed', 'Cancelled by customer.');
        this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
      }
      return 0;
    }
    if (payment.status !== 'succeeded' || order.paymentMethod === 'cod') return 0;
    // C-refund: only what is left on the payment goes back (lines a seller or a return already refunded are out).
    const due = refundableUsd(payment, order.items);
    const won = await this.payments.manager.transaction(async (m) => {
      if (due < 0.01) return this.claim(m, payment.id, ['succeeded'], 'refunded'); // nothing left to pay back: the payment is just closed
      try {
        await recordRefund(m, { payment, amountUsd: due, to: 'wallet', kind: 'cancellation', memo: `Refund for cancelled order ${order.reference}` });
      } catch (e) {
        if (e instanceof BadRequestException) return false; // a concurrent cancel refunded it first: exactly one wins
        throw e;
      }
      await this.wallet.apply(payment.userId, 'refund', due, `Refund for cancelled order ${order.reference}`, m);
      return true;
    });
    if (won) this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
    return won ? due : 0;
  }

  /**
   * What is still refundable on an order's payment by its lines alone: lines a seller already cancelled were refunded
   * on their own, so they are never paid back twice. (`refundableUsd` in refund-ledger.ts also counts the payment's own
   * running total of refunds, which is what every refund path is capped by.)
   */
  static outstanding(amountUsd: number, order: Pick<Order, 'items'>): number {
    const already = (order.items ?? []).reduce((t, i) => t + (i.refundedUsd ?? 0), 0);
    return Math.max(0, Number((amountUsd - already).toFixed(2)));
  }

  /** Phone refunds go back through pawaPay to the number that paid (mobile-money payments only). */
  canRefundToPhone(payment: Pick<Payment, 'method' | 'providerRef'>): boolean {
    return !!this.pawapay && this.mobileMoney?.name === 'pawapay' && isMobileMoney(payment.method) && !!payment.providerRef;
  }

  /**
   * Refund an order: to the customer's wallet (instant store credit, the default) or, for a pawaPay mobile-money
   * payment, back to the phone that paid (`toWallet === false`). A phone refund is "sending" until pawaPay confirms
   * it; if pawaPay fails it, the amount goes to the wallet instead so the customer is never left out.
   *
   * A parcel that was never delivered is called off: the order becomes `cancelled`, its stock goes back on the
   * shelf and any open delivery is voided. A delivered order becomes `returned`. Never pays back more than what is
   * still left on the payment (C-refund: lines a seller cancelled and items already returned were refunded on their
   * own); the refund is recorded in the ledger like every other, `result.refund` being this one.
   */
  async refund(orderId: string, toWallet: boolean, source: RefundSource = {}): Promise<RefundResult> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException('No payment for this order.');
    if (payment.status === 'refunded') {
      throw new BadRequestException('Already refunded.');
    }
    if (payment.status !== 'succeeded') {
      throw new BadRequestException('Only a completed payment can be refunded.');
    }
    if (toWallet === false && !this.canRefundToPhone(payment)) {
      throw new BadRequestException(
        isMobileMoney(payment.method)
          ? "Refunds to the phone need pawaPay to be connected. Refund to the customer's wallet."
          : "Only mobile-money payments can be refunded to a phone. Refund to the customer's wallet.",
      );
    }
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (order?.status === 'cancelled') {
      throw new BadRequestException('This order was cancelled and has already been settled.');
    }
    // C-refund (service): refuse with the real figure; recordRefund checks it again in the database, in the transaction.
    const due = refundableUsd(payment, order?.items);
    if (due < 0.01) throw new BadRequestException(NOTHING_LEFT_TO_REFUND);
    const toPhone = toWallet === false;
    const refundRef = toPhone ? this.pawapay!.newId() : null;
    // Atomic: of two concurrent refunds exactly one wins.
    const entry = await this.payments.manager.transaction(async (m) => {
      const { entry: recorded } = await recordRefund(m, {
        payment,
        amountUsd: due,
        to: toPhone ? 'phone' : 'wallet',
        kind: source.kind ?? 'admin',
        memo: `Refund for ${payment.orderReference}`,
        refundRef,
        disputeId: source.disputeId,
        disputeReference: source.disputeReference,
      });
      if (!toPhone) await this.wallet.apply(payment.userId, 'refund', due, `Refund for ${payment.orderReference}`, m);
      return recorded;
    });

    if (toPhone) {
      try {
        await this.pawapay!.refund({ refundId: refundRef!, depositId: payment.providerRef!, amountUsd: due, reference: payment.reference });
      } catch (e) {
        if (!(e instanceof PawapayUnavailableError)) {
          // pawaPay said no: undo, so finance can refund to the wallet instead.
          await this.payments.manager.transaction((m) => revertRefund(m, entry));
          throw new BadRequestException(`pawaPay refused the refund: ${(e as Error).message}`);
        }
        // No answer: the refund may exist; the status check settles it.
        this.logger.warn(`Refund ${refundRef} for ${payment.reference} unconfirmed: ${e.message}`);
      }
    }

    const saved = (await this.payments.findOne({ where: { id: payment.id } }))!;
    if (order) await this.closeRefundedOrder(order);
    this.publish(saved);
    await this.notifications.toUser(saved.userId, {
      title: 'Refund issued',
      body: toPhone
        ? `$${due.toFixed(2)} for ${saved.orderReference} is on its way back to your mobile-money number.`
        : `$${due.toFixed(2)} for ${saved.orderReference} → wallet.`,
      type: 'payment',
      entityId: orderId,
    });
    return { ...saved, refund: entry };
  }

  /** A refunded order: delivered → returned; otherwise cancelled, restocked, and its open deliveries voided. */
  private async closeRefundedOrder(order: Order): Promise<void> {
    const delivered = order.status === 'delivered' || order.status === 'returned';
    order.status = delivered ? 'returned' : 'cancelled';
    await this.orders.save(order);
    if (!delivered) {
      // The goods never reached the customer: back on the shelf, and no rider should still go for them.
      for (const item of order.items ?? []) {
        // A line a seller already cancelled was restocked then.
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
          await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: order.id, reason: 'cancel_restock' });
        }
      }
      const tasks = await this.deliveries.find({
        where: { orderId: order.id, status: In(['unassigned', 'assigned', 'picked_up', 'in_transit']) },
      });
      for (const task of tasks) {
        task.status = 'failed';
        task.failureReason = 'Refunded';
        await this.deliveries.save(task);
        // Admins, the warehouses at the ends of the leg (not every warehouse) and the rider hear that it was voided.
        this.emitter.toRoles(ADMIN_ROLES, 'delivery:updated', task);
        for (const hub of new Set([task.hubId, task.fromHubId, task.toHubId])) if (hub) this.emitter.toHub(hub, 'delivery:updated', task);
        if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
      }
    }
    this.emitter.toUser(order.customerId, 'order:updated', order);
    pushOrderToOps(this.emitter, ADMIN_ROLES, 'order:updated', order);
  }

  /**
   * Apply pawaPay's final word on a phone refund: completed → done; failed → the amount is credited to the wallet
   * instead (once), and finance is told.
   */
  async reconcileRefund(refundRef: string): Promise<void> {
    if (!this.pawapay) return;
    const payment = await this.payments.findOne({ where: { refundRef } });
    if (!payment || payment.refundStatus !== 'sending') return;
    let s;
    try {
      s = await this.pawapay.check('refunds', refundRef);
    } catch (e) {
      this.logger.warn(`Refund status check failed for ${refundRef}: ${(e as Error).message}`);
      return;
    }
    if (!s.found || !s.final) return;
    // This phone refund's own amount (the payment's `refundedUsd` is the running total of all its refunds).
    const entry = await this.payments.manager.findOne(PaymentRefund, { where: { refundRef } });
    const amount = entry?.amountUsd ?? payment.refundedUsd ?? payment.amountUsd;
    const to = s.succeeded ? 'completed' : 'failed';
    const won = await this.payments.manager.transaction(async (m) => {
      const res = await m
        .createQueryBuilder()
        .update(Payment)
        .set({ refundStatus: to, ...(s.succeeded ? {} : { refundTo: 'wallet' }) })
        .where("id = :id AND refundStatus = 'sending'", { id: payment.id })
        .execute();
      if (!res.affected) return false;
      // The ledger follows pawaPay's word: a failed phone refund is a wallet refund (the money is still the customer's).
      if (entry) await m.update(PaymentRefund, { id: entry.id }, { status: to, ...(s.succeeded ? {} : { refundTo: 'wallet' as const }) });
      if (!s.succeeded && amount > 0) {
        await this.wallet.apply(payment.userId, 'refund', amount, `Refund for ${payment.orderReference} (phone refund failed)`, m);
      }
      return true;
    });
    if (!won) return;
    this.publish((await this.payments.findOne({ where: { id: payment.id } }))!);
    if (s.succeeded) {
      await this.notifications.toUser(payment.userId, {
        title: 'Refund sent',
        body: `$${amount.toFixed(2)} for ${payment.orderReference} was sent to your mobile-money number.`,
        type: 'payment',
        entityId: payment.orderId ?? payment.id,
      });
    } else {
      await this.notifications.toUser(payment.userId, {
        title: 'Refund issued',
        body: `$${amount.toFixed(2)} for ${payment.orderReference} → wallet (the network could not take it back to your phone).`,
        type: 'payment',
        entityId: payment.orderId ?? payment.id,
      });
      await this.notifications.toRole('admin_finance', {
        title: 'Phone refund failed',
        body: `${payment.reference}: pawaPay could not refund $${amount.toFixed(2)}${s.failureMessage ? ` (${s.failureMessage})` : ''}. It was credited to the customer's wallet.`,
        type: 'payment',
        entityId: payment.id,
      });
    }
  }

  async list(user: { id: string; role: string }, paging?: unknown): Promise<PaymentView[]> {
    // Only finance/admin see every payment; everyone else just their own.
    const all = user.role === 'admin' || user.role === 'admin_finance';
    const { take, skip } = pageOf(paging, { def: all ? 200 : DEFAULT_LIMIT });
    const rows = all
      ? await this.payments.find({ order: { createdAt: 'DESC' }, take, skip })
      : await this.payments.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take, skip });
    return rows.map((p) => this.view(p));
  }

  /** A payment by reference, visible to its owner and to finance/admin. */
  async status(user: { id: string; role: string }, reference: string): Promise<PaymentView> {
    let p = await this.payments.findOne({ where: { reference } });
    const isStaff = user.role === 'admin' || user.role === 'admin_finance';
    if (!p || (p.userId !== user.id && !isStaff)) throw new NotFoundException('Payment not found.');
    // Waiting on the network: ask it now rather than wait for a callback.
    if (p.status === 'pending') p = await this.reconcileOne(p);
    return this.view(p);
  }

  /** Never push a full subscriber number to dashboards/sockets. `refundableUsd` is what finance may still refund on it. */
  private view(p: Payment): PaymentView {
    return { ...p, phone: mask(p.phone), refundableUsd: refundableUsd(p) };
  }

  /**
   * The refund ledger, newest first, for the admin Refunds page (admin / finance only): every refund of every payment
   * with its amount, where it went, when, and which return or dispute it belongs to.
   */
  async refundLog(user: { id: string; role: string }, paging?: unknown): Promise<(PaymentRefund & { paymentReference: string | null; method: string | null })[]> {
    if (user.role !== 'admin' && user.role !== 'admin_finance') throw new BadRequestException('Only admin/finance can see refunds.');
    const { take, skip } = pageOf(paging, { def: 500, max: 1000 });
    const rows = await this.payments.manager.find(PaymentRefund, { order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    const ids = [...new Set(rows.map((r) => r.paymentId))];
    const owners = ids.length ? await this.payments.find({ where: { id: In(ids) }, select: ['id', 'reference', 'method'] }) : [];
    const by = new Map(owners.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, paymentReference: by.get(r.paymentId)?.reference ?? null, method: by.get(r.paymentId)?.method ?? null }));
  }

  private publish(saved: Payment) {
    this.emitter.toUser(saved.userId, 'payment:updated', this.view(saved));
    this.emitter.toRoles(FINANCE_ROLES, 'payment:updated', this.view(saved));
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `PAY-${Date.now().toString().slice(-6)}${n}`.slice(0, 24);
  }
}

export type { PaymentPurpose };
